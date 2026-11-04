// 參數搜尋：先試一組啟發式的起點，之後在最好的幾個策略附近隨機突變（演化式區域搜尋）。
// 每次模擬只要 1~3 毫秒，所以可以在 Web Worker 裡一秒跑幾百次，邊跑邊回報目前最佳。

import { isTownCenter, resolveGoals, type CivData } from './civData.ts'
import { simulate } from './engine.ts'
import { rng } from './mapgen.ts'
import { RES, type GameMap, type Goal, type PlanResult, type Policy, type PostArmy, type Step, type StepParams } from './types.ts'

const MAX_T = 60 * 60

export interface SearchOptions {
  idleWeight?: number
  /** 目標後全力出兵；預設 30 兵 + 2 項升級 */
  post?: PostArmy
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
  const result = simulate(data, map, steps, p, { record, bound, idleWeight: opts.idleWeight ?? 60, post: opts.post ?? DEFAULT_POST, postBound: opts.postBound })
  for (const e of errors) result.warnings.push(e)
  return { policy: p, steps, result }
}

/** 硬性規則：先比城鎮中心中斷秒數，再比分數 */
function better(a: PlanResult, b: PlanResult) {
  if (a.tcIdle !== b.tcIdle) return a.tcIdle < b.tcIdle
  return a.score < b.score - 1e-6
}

const clone = (p: Policy): Policy => ({
  ...p,
  steps: p.steps.map((s) => ({ ...s, bias: { ...s.bias } })),
  ecoAt: { ...p.ecoAt },
  landmarkPick: { ...p.landmarkPick },
  trickle: Object.fromEntries(Object.entries(p.trickle ?? {}).map(([k, v]) => [k, { ...v }])),
})

function mutate(p: Policy, r: () => number, data: CivData, goals: Goal[]): Policy {
  const q = clone(p)
  const n = 1 + Math.floor(r() * 3)
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
  for (let k = 0; k < n; k++) {
    const which = r()
    const si = Math.floor(r() * Math.max(1, q.steps.length))
    const s = q.steps[si]
    if (which < 0.22 && s) s.builders = clamp(s.builders + pick([-2, -1, 1, 2]), 1, 10)
    else if (which < 0.5 && s) {
      const res = pick(RES)
      s.bias[res] = clamp(s.bias[res] + (r() - 0.5) * 0.2, -0.35, 0.35)
    }
    else if (which < 0.64 && s) s.producers = clamp(s.producers + pick([-1, 1]), 1, 8)
    else if (which < 0.72) q.postProducers = clamp(q.postProducers + pick([-2, -1, 1, 2]), 1, 9)
    else if (which < 0.77) q.houseBuffer = clamp(q.houseBuffer + pick([-1, 1]), 0, 6)
    else if (which < 0.81) q.hunt = !q.hunt
    else if (which < 0.86 && buildTrickles(data).length) {
      // 被動收入建築：改數量或開始的步驟
      const tr = pick(buildTrickles(data))
      const cur = q.trickle[tr.building] ?? { at: 0, count: 0 }
      if (r() < 0.6) cur.count = clamp(cur.count + pick([-1, 1, 2]), 0, tr.max)
      else cur.at = Math.floor(r() * Math.max(1, q.steps.length))
      q.trickle[tr.building] = cur
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
  private data: CivData
  private map: GameMap
  private goals: Goal[]
  private opts: SearchOptions

  constructor(data: CivData, map: GameMap, goals: Goal[], seed = 1, opts: SearchOptions = {}) {
    this.opts = opts
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
    const noHunt = clone(base)
    noHunt.hunt = false
    variants.push(noHunt)
    const eco = clone(base)
    for (const id of ['wheelbarrow', 'double-broadax', 'horticulture', 'specialized-pick', 'tawara', 'mohe-ancestry']) if (data.ecoTechs.includes(id)) eco.ecoAt[id] = Math.min(1, eco.steps.length - 1)
    variants.push(eco)
    for (const tr of buildTrickles(data)) {
      for (const count of [1, Math.min(tr.max, 3)]) {
        const p = clone(base)
        p.trickle[tr.building] = { at: 0, count }
        variants.push(p)
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
      }
    }
    return improved
  }

  private next(): Policy {
    if (!this.elite.length) return defaultPolicy(this.data, this.goals)
    // 偏向挑前段班
    const i = Math.floor(Math.pow(this.r(), 2) * this.elite.length)
    return mutate(this.elite[i].policy, this.r, this.data, this.goals)
  }

  private insert(ev: Evaluated) {
    this.elite.push(ev)
    this.elite.sort((a, b) => a.result.tcIdle - b.result.tcIdle || a.result.score - b.result.score)
    if (this.elite.length > 8) this.elite.length = 8
  }

  /** 用目前最佳策略重跑一次並記錄完整事件 */
  bestDetailed(): Evaluated | null {
    if (!this.best) return null
    return evaluate(this.data, this.map, this.goals, this.best.policy, MAX_T, true, this.opts)
  }
}
