// 在背景執行緒持續最佳化，每有進步就回傳完整的建造順序。

import type { Catalog } from '../types.ts'
import { buildCivData } from './civData.ts'
import { generateMap } from './mapgen.ts'
import { Searcher } from './search.ts'
import type { Goal, HolySettings, PlanResult, Policy, PostArmy, Step } from './types.ts'

export interface StartMessage {
  type: 'start'
  id: number
  civ: string
  mapType: string
  seed: number
  goals: Goal[]
  /** 目標後全力出兵的兵數與升級數 */
  post: PostArmy
  /** 地圖上能拿的聖物、聖地（沒給就不模擬） */
  holy?: HolySettings
  /** 最多跑多久（毫秒） */
  budgetMs: number
  /** 第幾個平行的 worker（決定亂數種子，讓各 worker 往不同方向搜） */
  worker?: number
}

export type WorkerIn = StartMessage | { type: 'stop' }

export type WorkerOut =
  | { type: 'best'; id: number; result: PlanResult; policy: Policy; steps: Step[]; evals: number; elapsed: number }
  | { type: 'progress'; id: number; evals: number; elapsed: number; running: boolean }
  | { type: 'error'; id: number; message: string }

let catalog: Catalog | null = null
let names: Record<string, string> = {}
let current = 0

async function ensureData() {
  if (catalog) return
  const [c, n] = await Promise.all([fetch('/sim/catalog.json').then((r) => r.json()), fetch('/sim/names-zh.json').then((r) => r.json())])
  catalog = c as Catalog
  names = n as Record<string, string>
}

const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m)

async function start(m: StartMessage) {
  current = m.id
  try {
    await ensureData()
  } catch (e) {
    post({ type: 'error', id: m.id, message: `載入資料失敗：${String(e)}` })
    return
  }
  if (current !== m.id) return
  const data = buildCivData(catalog!, m.civ, names)
  const map = generateMap(m.mapType, m.seed)
  const searcher = new Searcher(data, map, m.goals, m.seed + 11 + (m.worker ?? 0) * 7919, { post: m.post, holy: m.holy })
  const t0 = performance.now()
  let lastGain = t0
  let lastPost = 0
  let dirty = false

  const loop = () => {
    if (current !== m.id) return
    const improved = searcher.run(120)
    const now = performance.now()
    if (improved) {
      dirty = true
      lastGain = now
    }
    // 進步時最多每 250 毫秒回報一次完整結果
    if (dirty && now - lastPost > 250) {
      const d = searcher.bestDetailed()
      if (d) post({ type: 'best', id: m.id, result: d.result, policy: d.policy, steps: d.steps, evals: searcher.evals, elapsed: now - t0 })
      dirty = false
      lastPost = now
    }
    // 搜尋卡住時會自己重新開始，所以要給它時間；預算的三分之一（至少 15 秒）都沒進步才提早結束
    const done = now - t0 > m.budgetMs || now - lastGain > Math.max(15000, m.budgetMs / 3)
    post({ type: 'progress', id: m.id, evals: searcher.evals, elapsed: now - t0, running: !done })
    if (done) {
      if (dirty) {
        const d = searcher.bestDetailed()
        if (d) post({ type: 'best', id: m.id, result: d.result, policy: d.policy, steps: d.steps, evals: searcher.evals, elapsed: now - t0 })
      }
      return
    }
    setTimeout(loop, 0)
  }
  loop()
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  if (e.data.type === 'stop') {
    current = -1
    return
  }
  void start(e.data)
}
