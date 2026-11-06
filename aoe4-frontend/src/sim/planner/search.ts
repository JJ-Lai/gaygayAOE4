// 參數搜尋：先試一組啟發式的起點，之後在最好的幾個策略附近隨機突變（演化式區域搜尋）。
// 每次模擬只要 1~3 毫秒，所以可以在 Web Worker 裡一秒跑幾百次，邊跑邊回報目前最佳。

import { isTownCenter, resolveGoals, type CivData } from './civData.ts'
import { MAX_BOATS, MAX_TRADERS, simulate, zoneAnchors, zonePlan } from './engine.ts'
import { rng } from './mapgen.ts'
import { PHASE_SEC, RES, type GameMap, type HolySettings, type Goal, type PlanResult, type Policy, type PostArmy, type Step, type StepParams, type FishSettings, type ReplayScript, type TradeSettings } from './types.ts'

const MAX_T = 60 * 60
/** 前段班保留幾個策略 */
const ELITE = 16
/** 連續幾次評估沒進步就重新開始 */
const RESTART_AFTER = 1000

export interface SearchOptions {
  idleWeight?: number
  /** 目標後全力出兵；預設 30 兵 + 2 項升級 */
  post?: PostArmy
  /** 聖物與聖地的設定（使用者在頁面上設） */
  holy?: HolySettings
  /** 陸地貿易的設定（使用者在頁面上設） */
  trade?: TradeSettings
  /** 捕魚的設定（使用者在頁面上設） */
  fish?: FishSettings
  /** 操作損失：每次手動下指令多花的秒數 */
  opDelay?: number
  /** 操作損失：採集效率倍率 */
  efficiency?: number
  /** 回放職業對局（check-pro-replay.ts 用） */
  script?: ReplayScript
}

export const DEFAULT_POST: PostArmy = { units: 30, upgrades: 2 }

export function defaultStepParams(st: Step): StepParams {
  return {
    builders: st.kind === 'age' ? 4 : st.forward ? 2 : 1,
    bias: { food: 0, wood: 0, gold: 0, stone: 0 },
    producers: st.kind === 'army' ? 2 : 1,
  }
}

export function defaultPolicy(data: CivData, goals: Goal[]): Policy {
  const landmarkPick: Record<number, string> = {}
  for (const a of [2, 3, 4]) {
    const o = data.ageOptions[a]?.[0]
    if (o) landmarkPick[a] = o.id
  }
  const { steps } = resolveGoals(data, goals, landmarkPick)
  return {
    steps: steps.map(defaultStepParams),
    houseBuffer: 0,
    hunt: true,
    ecoAt: {},
    landmarkPick,
    postProducers: 3,
    trickle: {},
  }
}

/** 村民要另外蓋的被動收入建築（地標只在升代時蓋，不算） */
function buildTrickles(data: CivData) {
  return data.spec.trickles.filter((tr) => {
    const it = data.items.get(tr.building)
    return !!it && (it.kind === 'building' || tr.as === 'building') && !isTownCenter(data, it.id) && !it.variations.some((v) => v.tags.some((x) => x.startsWith('toAge')))
  })
}

export interface Evaluated {
  policy: Policy
  steps: Step[]
  result: PlanResult
}

function fit(policy: Policy, steps: Step[]): Policy {
  if (policy.steps.length === steps.length) return policy
  const out = steps.map((s, i) => policy.steps[i] ?? defaultStepParams(s))
  return { ...policy, steps: out }
}

export function evaluate(
  data: CivData,
  map: GameMap,
  goals: Goal[],
  policy: Policy,
  bound: number,
  record: boolean,
  opts: SearchOptions & { postBound?: number } = {},
): Evaluated | null {
  const { steps, errors } = resolveGoals(data, goals, policy.landmarkPick)
  if (errors.length && !steps.length) return null
  const p = fit(policy, steps)
  const result = simulate(data, map, steps, p, { record, bound, idleWeight: opts.idleWeight ?? 60, post: opts.post ?? DEFAULT_POST, postBound: opts.postBound, holy: opts.holy, trade: opts.trade, fish: opts.fish, opDelay: opts.opDelay, efficiency: opts.efficiency, script: opts.script })
  for (const e of errors) result.warnings.push(e)
  return { policy: p, steps, result }
}

/** 硬性規則：先比城鎮中心中斷秒數，再比分數 */
function better(a: PlanResult, b: PlanResult) {
  if (a.tcIdle !== b.tcIdle) return a.tcIdle < b.tcIdle
  return a.score < b.score - 1e-6
}

/** 控制器規則參數的範圍：[最小, 最大, 預設, 每次調整量]（預設和 engine.ts 的 CTL 相同） */
const CTL_RANGE = {
  rebalance: [3, 16, 8, 2],
  move: [0.05, 0.4, 0.15, 0.05],
  hyst: [1, 5, 3, 1],
  setup: [45, 300, 120, 30],
  camp: [3, 12, 6, 1],
  houseLead: [4, 30, 12, 3],
  farmLead: [30, 240, 90, 20],
  look: [0, 300, 180, 30],
} as const

const clone = (p: Policy): Policy => ({
  ctl: { ...(p.ctl ?? {}) },
  ...p,
  steps: p.steps.map((s) => ({ ...s, bias: { ...s.bias } })),
  ecoAt: { ...p.ecoAt },
  landmarkPick: { ...p.landmarkPick },
  trickle: Object.fromEntries(Object.entries(p.trickle ?? {}).map(([k, v]) => [k, { ...v }])),
  placeAt: Object.fromEntries(Object.entries(p.placeAt ?? {}).map(([k, v]) => [k, [...v]])),
  dynasty: { ...(p.dynasty ?? {}) },
  phaseBias: (p.phaseBias ?? []).map((b) => ({ ...b })),
  repeats: { ...(p.repeats ?? {}) },
  support: { ...(p.support ?? {}) },
})

/** 交配：每個欄位（每一步、每項科技、每一段時間偏好）隨機取自其中一方，讓搜尋能一次組合好幾項改動 */
function crossover(a: Policy, b: Policy, r: () => number): Policy {
  const q = clone(a)
  const o = clone(b)
  const coin = () => r() < 0.5
  q.steps = q.steps.map((s, i) => (o.steps[i] && coin() ? o.steps[i] : s))
  if (coin()) q.houseBuffer = o.houseBuffer
  if (coin()) q.hunt = o.hunt
  if (coin()) q.sheepCap = o.sheepCap
  if (coin()) q.postProducers = o.postProducers
  if (coin()) q.scholars = o.scholars
  if (coin()) q.herd = o.herd
  if (coin()) q.officials = o.officials
  if (coin()) q.collectEvery = o.collectEvery
  if (coin()) q.repeats = { ...(o.repeats ?? {}) }
  if (coin()) q.support = { ...(o.support ?? {}) }
  if (coin()) q.double = o.double
  if (coin()) q.festival = o.festival
  if (coin()) q.edict = o.edict
  if (coin()) q.relics = o.relics
  if (coin()) q.sites = o.sites
  if (coin()) q.traders = o.traders
  if (coin()) q.tolls = o.tolls
  if (coin()) q.tributaries = o.tributaries
  if (coin()) q.yams = o.yams
  if (coin()) q.link = o.link
  if (coin()) q.contract = o.contract
  if (coin()) q.ctl = { ...(o.ctl ?? {}) }
  if (coin()) q.boats = o.boats
  if (coin()) q.fishFrom = o.fishFrom
  if (coin()) q.governors = [...(o.governors ?? [])]
  for (const k of new Set([...Object.keys(q.ecoAt), ...Object.keys(o.ecoAt)])) if (coin()) {
    if (k in o.ecoAt) q.ecoAt[k] = o.ecoAt[k]
    else delete q.ecoAt[k]
  }
  for (const k of Object.keys(o.landmarkPick)) if (coin()) q.landmarkPick[Number(k)] = o.landmarkPick[Number(k)]
  for (const k of Object.keys(o.trickle)) if (coin()) q.trickle[k] = { ...o.trickle[k] }
  for (const k of Object.keys(o.placeAt ?? {})) if (coin()) q.placeAt = { ...(q.placeAt ?? {}), [k]: [...o.placeAt![k]] }
  for (const k of Object.keys(o.dynasty ?? {})) if (coin()) q.dynasty = { ...(q.dynasty ?? {}), [k]: o.dynasty![Number(k)] }
  const n = Math.max(q.phaseBias?.length ?? 0, o.phaseBias?.length ?? 0)
  q.phaseBias = Array.from({ length: n }, (_, i) => ({ ...((coin() ? o.phaseBias?.[i] : q.phaseBias?.[i]) ?? {}) }))
  return q
}

function mutate(p: Policy, r: () => number, data: CivData, goals: Goal[], map: GameMap, horizon = 600, so: SearchOptions = {}): Policy {
  const holy = so.holy
  const trade = so.trade && so.trade.posts > 0 ? so.trade : undefined
  const fish = so.fish && so.fish.spots > 0 ? so.fish : undefined
  const q = clone(p)
  const n = 1 + Math.floor(r() * 3)
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
  for (let k = 0; k < n; k++) {
    const which = r()
    const si = Math.floor(r() * Math.max(1, q.steps.length))
    const s = q.steps[si]
    if (which < 0.22 && s) s.builders = clamp(s.builders + pick([-2, -1, 1, 2]), 1, 10)
    else if (which < 0.38 && s) {
      const res = pick(RES)
      s.bias[res] = clamp(s.bias[res] + (r() - 0.5) * 0.2, -0.35, 0.35)
    }
    else if (which < 0.40) {
      // 控制器規則的參數：挑一項往上或往下調
      const k = pick(Object.keys(CTL_RANGE) as (keyof typeof CTL_RANGE)[])
      const [lo, hi, def, step] = CTL_RANGE[k]
      q.ctl = { ...(q.ctl ?? {}), [k]: clamp(Math.round(((q.ctl?.[k] ?? def) + pick([-1, 1]) * step) * 100) / 100, lo, hi) }
    }
    else if (which < 0.52) {
      // 依時間的資源偏好：挑一段（偏向目前最佳完成時間之前），調一種資源
      const end = Math.max(1, Math.ceil(horizon / PHASE_SEC))
      const i = Math.floor(r() * end)
      const pb = (q.phaseBias ??= [])
      while (pb.length <= i) pb.push({})
      const res = pick(RES)
      pb[i] = { ...pb[i], [res]: clamp((pb[i][res] ?? 0) + (r() - 0.5) * 0.3, -0.35, 0.35) }
    }
    else if (which < 0.64 && s) s.producers = clamp(s.producers + pick([-1, 1]), 1, 8)
    else if (which < 0.72) q.postProducers = clamp(q.postProducers + pick([-2, -1, 1, 2]), 1, 9)
    else if (which < 0.77) q.houseBuffer = clamp(q.houseBuffer + pick([-1, 1]), 0, 6)
    else if (which < 0.785) q.hunt = !q.hunt
    else if (which < 0.79 && holy && (holy.relics || holy.sites)) {
      // 聖物、聖地要拿幾個
      if (holy.relics && (!holy.sites || r() < 0.5)) q.relics = clamp((q.relics ?? 0) + pick([-1, 1]), 0, holy.relics)
      else q.sites = clamp((q.sites ?? 0) + pick([-1, 1]), 0, holy.sites)
    }
    else if (which < 0.80 && (trade || fish)) {
      // 陸地貿易：商人數；馬利收費哨站、金朝朝貢國數；捕魚：漁船數
      const opts: (() => void)[] = []
      if (trade) opts.push(() => { q.traders = clamp((q.traders ?? 0) + pick([-4, -2, -1, 1, 2, 4]), 0, MAX_TRADERS) })
      if (fish) opts.push(() => { q.boats = clamp((q.boats ?? 0) + pick([-4, -2, -1, 1, 2, 4]), 0, MAX_BOATS) })
      if (fish) opts.push(() => { q.fishFrom = clamp((q.fishFrom ?? 60) + pick([-60, -30, 30, 60, 120]), 0, 900) })
      if (trade && data.spec.trade?.tolls) opts.push(() => { q.tolls = clamp((q.tolls ?? 0) + pick([-1, 1]), 0, data.spec.trade!.tolls!.maxPerLeg) })
      if (trade && data.spec.trade?.speedAura) opts.push(() => { q.yams = clamp((q.yams ?? 0) + pick([-1, 1]), 0, 8) })
      if (trade && data.spec.trade?.tributary) opts.push(() => { q.tributaries = clamp((q.tributaries ?? 0) + pick([-1, 1]), 0, trade.posts) })
      pick(opts)()
    }
    else if (which < 0.81) q.sheepCap = clamp((q.sheepCap ?? 10) + pick([-3, -2, -1, 1, 2, 3]), 0, 10)
    else if (which < 0.86 && buildTrickles(data).length) {
      // 被動收入建築：改數量或開始的步驟
      const tr = pick(buildTrickles(data))
      const cur = q.trickle[tr.building] ?? { at: 0, count: 0 }
      if (r() < 0.6) cur.count = clamp(cur.count + pick([-1, 1, 2]), 0, tr.max)
      else cur.at = Math.floor(r() * Math.max(1, q.steps.length))
      q.trickle[tr.building] = cur
    }
    else if (which < 0.865 && (data.spec.herd || data.spec.officials || data.spec.support?.length || data.spec.doubleProduce || data.spec.festival || data.spec.edicts || data.spec.governors || data.spec.mercenaries || data.spec.civTechs.some((c) => c.repeat) || data.spec.triggers.some((x) => x.stockpile))) {
      // 馬利買牛、中國監工、可重複科技次數、公會廳收取間隔
      const opts: (() => void)[] = []
      if (data.spec.herd) opts.push(() => { q.herd = clamp((q.herd ?? 0) + pick([-2, -1, 1, 2]), 0, data.spec.herd!.max) })
      if (data.spec.officials) opts.push(() => { q.officials = clamp((q.officials ?? 0) + pick([-1, 1]), 0, data.spec.officials!.max) })
      for (const c of data.spec.civTechs.filter((x) => x.repeat)) opts.push(() => { q.repeats = { ...(q.repeats ?? {}), [c.id]: clamp((q.repeats?.[c.id] ?? 1) + pick([-1, 1]), 1, c.repeat!) } })
      if (data.spec.triggers.some((x) => x.stockpile)) opts.push(() => { q.collectEvery = clamp((q.collectEvery ?? 180) + pick([-60, -30, 30, 60, 120]), 40, 900) })
      for (const su of data.spec.support ?? []) opts.push(() => { q.support = { ...(q.support ?? {}), [su.unit]: clamp((q.support?.[su.unit] ?? 0) + pick([-1, 1]), 0, su.max) } })
      if (data.spec.doubleProduce) opts.push(() => { q.double = !q.double })
      if (data.spec.festival) opts.push(() => { q.festival = pick([undefined, ...Object.keys(data.spec.festival!.options)]) })
      if (data.spec.edicts) opts.push(() => { q.edict = pick([undefined, ...Object.keys(data.spec.edicts!.options)]) })
      if (data.spec.mercenaries) opts.push(() => { q.contract = pick(Object.keys(data.spec.mercenaries!.contracts)) })
      if (data.spec.governors) opts.push(() => {
        // 總督：換掉某一座的人選（每位只能一座）
        const keys = Object.keys(data.spec.governors!.options)
        const g = [...(q.governors ?? [])]
        const i = Math.floor(r() * Math.min(6, g.length + 1))
        g[i] = pick(keys.filter((k) => !g.includes(k) || g[i] === k))
        q.governors = g.filter(Boolean)
      })
      if (opts.length) pick(opts)()
    }
    else if (which < 0.87 && (data.spec.dynasty?.length || data.spec.scholars)) {
      // 朝代要不要補蓋地標；德里學者人數
      if (data.spec.scholars && (!data.spec.dynasty?.length || r() < 0.5)) q.scholars = clamp((q.scholars ?? 0) + pick([-2, -1, 1, 2]), 0, data.spec.scholars.max)
      else if (data.spec.dynasty?.length) {
        const a = pick(data.spec.dynasty)
        q.dynasty = { ...(q.dynasty ?? {}), [a]: !q.dynasty?.[a] }
      }
    }
    else if (which < 0.89 && data.spec.zones?.length) {
      // 光環建築：換位置；可以蓋多座的（蓄水池）也改數量
      const z = pick(data.spec.zones)
      const cands = zoneAnchors(z, map)
      const cur = zonePlan(data.spec, q, map, z.building)
      if (z.link && r() < 0.2) q.link = !q.link
      else if (z.max && z.max > 1 && r() < 0.4) {
        if (r() < 0.5 && cur.length > 0) cur.splice(Math.floor(r() * cur.length), 1)
        else if (cur.length < z.max) cur.push(pick(cands))
      } else if (cur.length) cur[Math.floor(r() * cur.length)] = pick(cands)
      q.placeAt = { ...(q.placeAt ?? {}), [z.building]: cur }
    }
    else if (which < 0.93 && data.ecoTechs.length) {
      const id = pick(data.ecoTechs)
      q.ecoAt[id] = r() < 0.35 ? -1 : Math.floor(r() * Math.max(1, q.steps.length))
    } else {
      const a = pick([2, 3, 4])
      const opts = data.ageOptions[a] ?? []
      if (opts.length > 1) {
        const explicit = goals.some((g) => g.kind === 'age' && g.age === a && g.via)
        if (!explicit) q.landmarkPick[a] = pick(opts).id
      }
    }
  }
  return q
}

export class Searcher {
  best: Evaluated | null = null
  evals = 0
  private elite: Evaluated[] = []
  private r: () => number
  private seeds: Policy[] = []
  /** 起點策略（重新開始時從這裡突變） */
  private initial: Policy[] = []
  /** 多久沒進步（評估次數） */
  private stale = 0
  private data: CivData
  private map: GameMap
  private goals: Goal[]
  private opts: SearchOptions

  constructor(data: CivData, map: GameMap, goals: Goal[], seed = 1, opts: SearchOptions = {}) {
    this.opts = opts
    // 捕魚開啟時，碼頭的捕魚科技（延繩、流網）也加進可研究的經濟科技
    if (opts.fish && opts.fish.spots > 0) data = { ...data, ecoTechs: [...data.ecoTechs, ...['extended-lines', 'drift-nets'].filter((id) => data.items.has(id) && !data.ecoTechs.includes(id))] }
    this.data = data
    this.map = map
    this.goals = goals
    this.r = rng(seed)
    const base = defaultPolicy(data, goals)
    const variants: Policy[] = [base]
    for (const b of [2, 3, 6, 8]) {
      const p = clone(base)
      p.steps.forEach((s, i) => {
        if (i < p.steps.length && s.builders >= 4) s.builders = b
      })
      variants.push(p)
    }
    // 開局食物：羊最多幾人（其餘去野果）。有野果加成的文明多半該早點採野果，交給搜尋比較
    for (const cap of [0, 2, 4, 6]) {
      const p = clone(base)
      p.sheepCap = cap
      variants.push(p)
    }
    const noHunt = clone(base)
    noHunt.hunt = false
    variants.push(noHunt)
    const eco = clone(base)
    for (const id of ['wheelbarrow', 'double-broadax', 'horticulture', 'specialized-pick', 'tawara', 'mohe-ancestry']) if (data.ecoTechs.includes(id)) eco.ecoAt[id] = Math.min(1, eco.steps.length - 1)
    variants.push(eco)
    // 組合起點：早期經濟科技 + 不打鹿（單一突變很難同時改兩項）
    const ecoNoHunt = clone(eco)
    ecoNoHunt.hunt = false
    variants.push(ecoNoHunt)
    // 文明專屬經濟科技（新鮮食材、大名宅邸、邊境聚落…）：一個全部第一步就研的起點，其餘交給突變
    const civTechs = data.spec.civTechs.map((c) => c.id).filter((id) => data.ecoTechs.includes(id))
    if (civTechs.length) {
      const p = clone(eco)
      for (const id of civTechs) p.ecoAt[id] = 0
      variants.push(p)
    }
    for (const tr of buildTrickles(data)) {
      for (const count of [1, Math.min(tr.max, 3)]) {
        const p = clone(base)
        p.trickle[tr.building] = { at: 0, count }
        variants.push(p)
      }
    }
    // 朝代：補蓋宋（二代）、宋＋元；德里學者 1、2、4 名
    for (const d of (data.spec.dynasty?.length ? [{ 2: true }, { 2: true, 3: true }] : []) as Record<number, boolean>[]) {
      const p = clone(base)
      p.dynasty = d
      variants.push(p)
    }
    if (data.spec.doubleProduce) {
      const p = clone(base)
      p.double = true
      variants.push(p)
    }
    // 聖物與聖地：全拿、只拿聖物、只佔聖地
    if (opts.holy && (opts.holy.relics || opts.holy.sites)) {
      for (const [rl, st] of [[opts.holy.relics, opts.holy.sites], [opts.holy.relics, 0], [0, opts.holy.sites]]) {
        if (!rl && !st) continue
        const p = clone(base)
        p.relics = rl
        p.sites = st
        variants.push(p)
      }
    }
    // 陸地貿易：5、10、20 名商人（馬利再加收費哨站、金朝再加朝貢國）
    if (opts.trade && opts.trade.posts > 0) {
      for (const n of [5, 10, 20]) {
        const p = clone(base)
        p.traders = n
        if (data.spec.trade?.tolls) p.tolls = data.spec.trade.tolls.maxPerLeg
        variants.push(p)
      }
      if (data.spec.trade?.tributary) {
        const p = clone(base)
        p.tributaries = opts.trade.posts
        variants.push(p)
      }
    }
    // 捕魚：4、8、12 艘漁船，從 1 分鐘或 3 分鐘開始
    if (opts.fish && opts.fish.spots > 0) {
      for (const n of [4, 8, 12]) {
        for (const from of [60, 180]) {
          const p = clone(base)
          p.boats = n
          p.fishFrom = from
          variants.push(p)
        }
      }
    }
    // 金角塔：每份合約一個起點
    for (const k of Object.keys(data.spec.mercenaries?.contracts ?? {})) {
      const p = clone(base)
      p.contract = k
      variants.push(p)
    }
    for (const k of Object.keys(data.spec.edicts?.options ?? {})) {
      const p = clone(base)
      p.edict = k
      variants.push(p)
    }
    for (const k of Object.keys(data.spec.governors?.options ?? {})) {
      const p = clone(base)
      p.governors = [k]
      variants.push(p)
    }
    for (const k of Object.keys(data.spec.festival?.options ?? {})) {
      const p = clone(base)
      p.festival = k
      variants.push(p)
    }
    for (const su of data.spec.support ?? []) {
      const p = clone(base)
      p.support = { [su.unit]: Math.min(2, su.max) }
      variants.push(p)
    }
    for (const n of data.spec.herd ? [3, 6] : []) {
      const p = clone(base)
      p.herd = n
      variants.push(p)
    }
    for (const n of data.spec.officials ? [1, 2] : []) {
      const p = clone(base)
      p.officials = n
      variants.push(p)
    }
    for (const n of data.spec.scholars ? [1, 2, 4] : []) {
      const p = clone(base)
      p.scholars = n
      variants.push(p)
    }
    // 光環建築：每個候選位置各一個起點；蓄水池再試 0、2、3 座
    for (const z of data.spec.zones ?? []) {
      const cands = zoneAnchors(z, map)
      for (const a of cands.slice(1)) {
        const p = clone(base)
        p.placeAt = { [z.building]: [a] }
        variants.push(p)
      }
      if (z.max && z.max > 1) {
        for (const n of [0, 2, 3]) {
          const p = clone(base)
          p.placeAt = { [z.building]: cands.slice(0, n).concat(Array(Math.max(0, n - cands.length)).fill('home')) }
          variants.push(p)
          // 連渡槽提升水位
          if (z.link && n >= 2) {
            const q = clone(p)
            q.link = true
            variants.push(q)
          }
        }
      }
    }
    for (const a of [2, 3, 4]) {
      for (const o of data.ageOptions[a] ?? []) {
        const p = clone(base)
        p.landmarkPick[a] = o.id
        variants.push(p)
      }
    }
    this.seeds = variants
    this.initial = variants.map(clone)
  }

  /** 跑 ms 毫秒；回傳這段期間是否有進步 */
  run(ms: number): boolean {
    const start = performance.now()
    let improved = false
    while (performance.now() - start < ms) {
      const policy = this.seeds.length ? this.seeds.shift()! : this.next()
      const b = this.best?.result
      // 剪枝：目標比目前最佳晚太多、或全力出兵比最佳慢太多，就提早結束
      const bound = b && b.ok ? Math.min(MAX_T, b.finish + (b.armyAt != null ? 180 : 90)) : MAX_T
      const postBound = b && b.armyAt != null && Number.isFinite(b.armyAt) ? b.armyAt + 60 : undefined
      const ev = evaluate(this.data, this.map, this.goals, policy, bound, false, { ...this.opts, postBound })
      this.evals++
      if (!ev) continue
      this.insert(ev)
      if (!this.best || better(ev.result, this.best.result)) {
        this.best = ev
        improved = true
        this.stale = 0
      } else if (++this.stale >= RESTART_AFTER && !this.seeds.length) {
        // 卡在區域最佳：只留目前最佳，從各起點各突變一次重新開始（避免整個前段班都收斂到同一種做法）
        this.elite = [this.best]
        this.seeds = this.initial.map((p) => mutate(p, this.r, this.data, this.goals, this.map, 600, this.opts))
        this.stale = 0
      }
    }
    return improved
  }

  private next(): Policy {
    if (!this.elite.length) return defaultPolicy(this.data, this.goals)
    // 偏向挑前段班
    const pickElite = () => this.elite[Math.floor(Math.pow(this.r(), 2) * this.elite.length)].policy
    const b = this.best?.result
    const horizon = b && b.ok ? (b.armyAt != null && Number.isFinite(b.armyAt) ? b.armyAt : b.finish) : 600
    // 三成交配後再突變，七成直接突變
    if (this.elite.length > 1 && this.r() < 0.3) {
      const child = crossover(pickElite(), pickElite(), this.r)
      return this.r() < 0.5 ? child : mutate(child, this.r, this.data, this.goals, this.map, horizon, this.opts)
    }
    return mutate(pickElite(), this.r, this.data, this.goals, this.map, horizon, this.opts)
  }

  private insert(ev: Evaluated) {
    this.elite.push(ev)
    this.elite.sort((a, b) => a.result.tcIdle - b.result.tcIdle || a.result.score - b.result.score)
    if (this.elite.length > ELITE) this.elite.length = ELITE
  }

  /** 用目前最佳策略重跑一次並記錄完整事件 */
  bestDetailed(): Evaluated | null {
    if (!this.best) return null
    return evaluate(this.data, this.map, this.goals, this.best.policy, MAX_T, true, this.opts)
  }
}
