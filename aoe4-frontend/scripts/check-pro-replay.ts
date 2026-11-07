// 回放職業對局，驗證模擬器：node --experimental-strip-types scripts/check-pro-replay.ts [文明 id 或 all]
// 讀 scripts/pro-games.json（fetch-pro-games.mjs 產生），讓模擬「照職業的操作做」，不跑最佳化：
//   - 每個動作（建築、單位、科技、升代）各是一個目標，不早於職業開始做的時間（完成時間減掉所需時間），照開始時間排序；
//     升代：地標 = 完成 − 建造時間 ÷ 2（預設 4 人蓋，速度 (4+2)/3 = 2 倍），升代科技 = 完成 − 研究時間；
//     要下一個時代才能做的動作排在那次升代之後。房屋、農田、投放點、城牆由模擬自己蓋（不當目標）。
//   - 城鎮中心照職業出村民的時間生產；村民照職業每 20 秒各資源的收入比例分配；職業蓋了投放點之後模擬才蓋營地。
// 每場跑一次，沒有操作損失（照職業的操作做，時間就該跟職業一樣；2026-11-07 起不再另加操作損失）。比較：
//   - 收入：同一時間點的累計收入，模擬 ÷ 職業。同樣的分配下，這就是採集模型的準確度（< 1 表示模擬採得比職業慢）。
//   - 時間：升代時間，以及每個動作完成時間的延遲（模擬 − 職業，中位數）。
// 地圖一律用乾燥阿拉伯（唯一有實測距離的地圖）。GAME=<對局 id> 印出逐目標與逐分鐘的除錯資訊。
// 輸出：scripts/pro-replay.json（跑全部文明時才寫）
import { readFileSync, writeFileSync } from 'node:fs'
import { buildCivData, isBuildable, isTownCenter, minAge, resolveGoals, variationAt, type CivData } from '../src/sim/planner/civData.ts'
import { generateMap } from '../src/sim/planner/mapgen.ts'
import { defaultPolicy, evaluate } from '../src/sim/planner/search.ts'
import type { Goal, PlanResult, ReplayScript } from '../src/sim/planner/types.ts'
import type { Catalog } from '../src/sim/types.ts'

const catalog = JSON.parse(readFileSync(new URL('../public/sim/catalog.json', import.meta.url), 'utf8')) as Catalog
const names = JSON.parse(readFileSync(new URL('../public/sim/names-zh.json', import.meta.url), 'utf8')) as Record<string, string>
const pro = JSON.parse(readFileSync(new URL('./pro-games.json', import.meta.url), 'utf8'))
const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : undefined
const clock = (s: number | null | undefined) => (s != null && Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—')
const abbrOf = new Map(catalog.civilizations.map((c) => [c.id, c.abbr]))

interface Sample {
  civ: string
  game: number
  name: string
  rating: number
  map: string
  ages: Record<string, number | null>
  villagers: [number, string][]
  buildings: [number, string][]
  units: [number, string][]
  techs: [number, string][]
  gathered?: { t: number[]; food: number[]; wood: number[]; gold: number[]; stone: number[]; income?: boolean }
}

/** 模擬自己會蓋的東西（不當成目標）：房屋、農田、投放點、城牆、首都 */
function controllerBuilt(data: CivData, id: string) {
  if (id === data.houseId || id === data.spec.farm.id || /farm|wall|palisade|gate|aqueduct/.test(id)) return true
  if (isTownCenter(data, id) && id.includes('capital')) return true
  for (const list of Object.values(data.spec.dropoff)) if (list.includes(id)) return true
  return ['mill', 'lumber-camp', 'mining-camp', 'ger', 'farmhouse', 'forge', 'house', 'longhouse'].includes(id)
}
const isDropoff = (data: CivData, id: string) => Object.values(data.spec.dropoff).some((l) => l.includes(id)) || ['mill', 'lumber-camp', 'mining-camp'].includes(id)

/** 職業每個動作 → 帶開始時間的目標，照開始時間排序 */
/**
 * 職業在 20 秒那一格裡哪一秒付錢：格子起點的庫存加上這格的收入速率，算每種資源湊齊費用的時間，取最晚的
 * （花費序列只有 20 秒一筆；直接用格子中間會讓反推的建造人數偏少）
 */
function payTime(s: Sample, ts: number, cost: { food: number; wood: number; gold: number; stone: number }) {
  const g = s.gathered!
  const i = g.t.findIndex((x) => x >= ts)
  if (i < 0 || i + 1 >= g.t.length) return ts + 10
  const dt = g.t[i + 1] - g.t[i]
  let at = 0
  for (const k of ['food', 'wood', 'gold', 'stone'] as const) {
    // 費用用這一格實際花掉的（有文明折扣時比目錄價低）
    const short = Math.min(cost[k], Math.max(0, g.spent[k][i + 1] - g.spent[k][i])) - g.stock[k][i]
    if (short <= 0) continue
    const rate = (g[k][i + 1] - g[k][i]) / dt
    at = Math.max(at, rate > 0 ? Math.min(dt, short / rate) : dt)
  }
  return ts + at
}
/**
 * 紀錄裡有、但職業沒付錢的動作（照花費序列檢查，付不出來的不當目標）：
 * 蒙古的建築可以打包搬家，重新架設也記成一筆建築；鄂圖曼軍事學校免費持續產兵，產出的兵也記成一筆單位
 */
const UNPAID: Record<string, { kind: 'build' | 'army'; label: string }> = { mongols: { kind: 'build', label: '搬家' }, ottomans: { kind: 'army', label: '軍事學校免費' } }
// 2026-11-07：其他文明也檢查單位（免費產出的兵），111 場城堡 20 秒內 56 → 58 場，其他不變
/** 模擬的建造人走到工地約幾秒（反推人數時扣掉） */
const WALK = 6

function goalsOf(data: CivData, s: Sample) {
  const end = s.ages[3] ?? s.ages[2]!
  const ageIds = new Set(Object.values(data.ageOptions).flat().map((o) => o.id))
  const skipped = new Set<string>()
  const list: { key: number; goal: Goal; done: number; builders?: number }[] = []
  // 升代：用職業紀錄裡出現的地標／升代科技
  const ageStart: Record<number, number> = {}
  /** 升代地標的建造人數（由職業的建造時間反推） */
  const builders: Record<number, number> = {}
  // 工人的建造倍率（金朝鄉騎：地標 ×1.75、一般建築 ×2）：反推人數時要除掉，否則人數會多算
  const wb = data.spec.workerSpecs?.[data.spec.worker ?? '']?.build
  const bMul = { landmark: wb?.landmark ?? 1, other: wb?.other ?? 1 }
  for (const a of [2, 3]) {
    const done = s.ages[a]
    if (done == null) continue
    const used = new Set([...s.buildings, ...s.techs].filter(([t]) => t <= done + 1).map(([, id]) => id))
    const opt = (data.ageOptions[a] ?? []).find((o) => used.has(o.id))
    let start = opt ? done - (opt.mode === 'building' ? opt.time / 2 : opt.time) : done - 60
    // 職業實際放下地標（或開始研究升代）的時間：花費序列裡這筆費用入帳的那一格（20 秒一筆，取起點，讓模擬最早能在那時開始）
    const g = s.gathered
    if (opt && g?.spent) {
      let ts: number | null = null
      for (let i = 1; i < g.t.length && g.t[i] <= done + 20; i++) {
        // 付錢的那一格要在完成前（蓋好之後才付的是別的東西）
        if (g.spent.food[i] - g.spent.food[i - 1] >= opt.cost.food * 0.9 && g.spent.gold[i] - g.spent.gold[i - 1] >= opt.cost.gold * 0.9 && g.t[i - 1] <= done - 15) ts = g.t[i - 1]
      }
      if (ts != null && ts < done) {
        // 最早開始 = 推算的付錢那一秒（以前用格子起點，模擬可能比職業早 10 多秒開始；111 場城堡誤差中位數 7 → 4 秒）
        // 研究升代（金帳、阿拔斯、阿尤布…）：完成 − 研究時間就是開始的那一秒，比從花費推算準（職業的黃金看不到收入時推算會落到格子尾端）
        start = opt.mode === 'building' ? payTime(s, ts, opt.cost) : Math.max(ts - 20, done - opt.time)
        // 地標：由職業的建造時間反推派了幾個人（建造速度 (人數 + 2) ÷ 3），模擬照同樣人數蓋
        if (opt.mode === 'building') builders[a] = Math.max(1, Math.min(15, Math.round((3 * opt.time) / bMul.landmark / Math.max(1, done - payTime(s, ts, opt.cost) - WALK) - 2)))
      }
    }
    ageStart[a] = start
    list.push({ key: start, done, goal: opt ? { kind: 'age', age: a as 2 | 3, via: opt.id, at: Math.max(0, start) } : { kind: 'age', age: a as 2 | 3, at: Math.max(0, start) } })
  }
  const after = (id: string, start: number) => {
    const need = minAge(data.items.get(id)!)
    return need >= 2 && ageStart[need] != null ? Math.max(start, ageStart[need] + 0.5) : start
  }
  const durOf = (id: string) => {
    const it = data.items.get(id)!
    return variationAt(it, Math.max(2, minAge(it))).time
  }
  const known = (id: string) => {
    if (data.items.has(id)) return true
    skipped.add(id)
    return false
  }
  for (const [t, id] of s.buildings) {
    if (t > end || !known(id) || controllerBuilt(data, id) || ageIds.has(id) || !isBuildable(data, id)) continue
    let start = t - durOf(id)
    // 貴的建築（300 資源以上，例如城鎮中心）：從花費序列找職業付錢（放下）的時間，反推派了幾個人（建造速度 (人數 + 2) ÷ 3）；
    // 便宜的建築容易和同一格的其他花費混在一起，不推算
    let nb: number | undefined
    const cost = variationAt(data.items.get(id)!, Math.max(2, minAge(data.items.get(id)!)))
    const need = { food: cost.food, wood: cost.wood, gold: cost.gold, stone: cost.stone }
    const g = s.gathered
    if (g?.spent && need.food + need.wood + need.gold + need.stone >= 300) {
      let ts: number | null = null
      for (let i = 1; i < g.t.length && g.t[i] <= t + 20; i++) {
        if (g.t[i] < t - durOf(id) - 20) continue
        const ok = (['food', 'wood', 'gold', 'stone'] as const).every((k) => need[k] <= 0 || g.spent[k][i] - g.spent[k][i - 1] >= need[k] * 0.9)
        if (ok && g.t[i - 1] <= t - 15) ts = g.t[i - 1]
      }
      // 一格找不到：先放寬到目錄價的 60%（文明折扣，例如阿拔斯新月沃土城鎮中心 -30%：職業付 280 木 210 石），
      // 再找付錢跨了兩格的（木材、石頭分在相鄰兩格入帳），取前一格的起點（以前找不到就當 1 人蓋，阿拔斯的城鎮中心晚 1 分半）
      if (ts == null)
        for (let i = 1; i < g.t.length && g.t[i] <= t + 20; i++) {
          if (g.t[i] < t - durOf(id) - 20) continue
          const ok = (['food', 'wood', 'gold', 'stone'] as const).every((k) => need[k] <= 0 || g.spent[k][i] - g.spent[k][i - 1] >= need[k] * 0.6)
          if (ok && g.t[i - 1] <= t - 15) ts = g.t[i - 1]
        }
      if (ts == null)
        for (let i = 2; i < g.t.length && g.t[i] <= t + 20; i++) {
          if (g.t[i] < t - durOf(id) - 20) continue
          const ok = (['food', 'wood', 'gold', 'stone'] as const).every((k) => need[k] <= 0 || g.spent[k][i] - g.spent[k][i - 2] >= need[k] * 0.9)
          if (ok && g.t[i - 2] <= t - 15) ts = g.t[i - 2]
        }
      if (ts != null && ts < t) {
        start = payTime(s, ts, need)
        nb = Math.max(1, Math.min(15, Math.round((3 * durOf(id)) / bMul.other / Math.max(1, t - payTime(s, ts, need) - WALK) - 2)))
      }
    }
    list.push({ key: after(id, start), done: t, goal: { kind: 'build', item: id, count: 1, at: Math.max(0, start) }, builders: nb })
  }
  const unitCount = new Map<string, number>()
  /** 非軍事單位：輔助單位、學者、監工照職業的數量訓練（時間交給模擬） */
  const extra = { support: {} as Record<string, number>, scholars: 0, officials: 0, herd: 0 }
  for (const [t, id] of s.units) {
    // 馬利的牛：照職業買的數量（時間交給模擬）
    if (t <= end && id === 'cattle' && data.spec.herd) extra.herd++
    if (t > end || !known(id)) continue
    const it = data.items.get(id)!
    // 當建築蓋的被動收入點（戰國屋台）：照職業的時間蓋
    if (data.spec.trickles.some((tr) => tr.building === id && tr.as === 'building')) {
      list.push({ key: t - 15, done: t, goal: { kind: 'build', item: id, count: 1, at: Math.max(0, t - 15) } })
      continue
    }
    if (data.spec.support?.some((su) => su.unit === id)) extra.support[id] = (extra.support[id] ?? 0) + 1
    if (data.spec.scholars?.unit === id) extra.scholars++
    if (data.spec.officials?.unit === id) extra.officials++
    if (!it.military || data.spec.notMilitary.includes(id)) continue
    unitCount.set(id, (unitCount.get(id) ?? 0) + 1)
    const start = t - durOf(id)
    list.push({ key: after(id, start), done: t, goal: { kind: 'army', unit: id, count: unitCount.get(id)!, at: Math.max(0, start) } })
  }
  /** 職業在 t 秒時的時代 */
  const ageAt = (t: number) => ([4, 3, 2] as const).find((a) => s.ages[a] != null && t >= s.ages[a]!) ?? 1
  for (const [t, id] of s.techs) {
    if (t > end || !known(id)) continue
    if (ageIds.has(id) || data.items.get(id)!.kind !== 'technology') continue
    // 時代還不到就出現的科技是送的（蒙古鹿石完成時給驛站網路），不是研究的
    if (minAge(data.items.get(id)!) > ageAt(t)) {
      skipped.add(`${id}（送的）`)
      continue
    }
    const start = t - durOf(id)
    list.push({ key: after(id, start), done: t, goal: { kind: 'tech', item: id, at: Math.max(0, start) } })
  }
  // 照時間順序累計職業的花費，花費序列付不出來的那筆當成沒付錢（蒙古搬家：例如 4 秒內 3 座馬廄；鄂圖曼軍事學校免費產的兵）
  // 其他文明：單位紀錄也照花費檢查（拜占庭競技場、蘭卡斯特伯爵衛隊、黃金部隊等免費產出的兵）
  const unpaid = UNPAID[s.civ] ?? { kind: 'army' as const, label: '沒付錢' }
  if (unpaid && s.gathered?.spent) {
    const g = s.gathered
    const spentBy = (k: 'food' | 'wood' | 'gold' | 'stone', at: number) => {
      const i = g.t.findIndex((x) => x >= at)
      return g.spent[k][i < 0 ? g.t.length - 1 : i]
    }
    const zeroC = { food: 0, wood: 0, gold: 0, stone: 0 }
    const ageOpt = new Map(Object.values(data.ageOptions).flat().map((o) => [o.id, o]))
    const costOfId = (id: string) => {
      const o = ageOpt.get(id)
      if (o) return o.cost
      const it = data.items.get(id)
      return it ? variationAt(it, Math.max(2, minAge(it))) : zeroC
    }
    // 職業所有的紀錄（村民、建築、單位、科技）都算進花費；只有要檢查的那一類可能被判定沒付錢
    const recs = [
      ...s.villagers.map(([t, id]) => ({ t, id, kind: 'vill' })),
      ...s.buildings.map(([t, id]) => ({ t, id, kind: 'build' })),
      ...s.units.map(([t, id]) => ({ t, id, kind: 'army' })),
      ...s.techs.map(([t, id]) => ({ t, id, kind: 'tech' })),
    ]
      .filter((r) => r.t <= end + 60)
      .sort((a, b) => a.t - b.t)
    const keyOf = (kind: string, id: string, t: number) => `${kind}:${id}:${t}`
    const goalKeys = new Set(list.map((x) => keyOf(x.goal.kind, x.goal.kind === 'army' ? x.goal.unit : x.goal.kind === 'age' ? '' : x.goal.item, x.done)))
    const acc = { ...zeroC }
    const res = ['food', 'wood', 'gold', 'stone'] as const
    /** 判定沒付錢的紀錄：kind:id:秒 → 筆數 */
    const free = new Map<string, number>()
    let prev: { id: string; t: number; kind: string } | null = null
    for (const r of recs) {
      let c = costOfId(r.id)
      // 蒙古雙倍生產：同一秒出的第二名只付石頭（等於一名的總價）
      if (data.spec.doubleProduce && (r.kind === 'army' || r.kind === 'vill') && prev && prev.id === r.id && prev.t === r.t && prev.kind === r.kind) {
        c = { ...zeroC, stone: c.food + c.wood + c.gold }
        prev = null
      } else prev = r
      // 要檢查的那一類裡，不是目標的紀錄（蒙古包等投放點、開局展開的城鎮中心）由模擬自己處理，不算進花費
      if (r.kind === unpaid.kind && !goalKeys.has(keyOf(r.kind, r.id, r.t))) continue
      if (r.kind === unpaid.kind && !res.every((k) => c[k] <= 0 || spentBy(k, r.t + 20) >= acc[k] + c[k] * 0.9)) {
        const key = `${r.kind}:${r.id}:${r.t}`
        free.set(key, (free.get(key) ?? 0) + 1)
        continue
      }
      for (const k of res) acc[k] += c[k]
    }
    const drop = new Set<number>()
    list.forEach((x, i) => {
      const gl = x.goal
      if (gl.kind !== unpaid.kind) return
      const key = `${gl.kind}:${gl.kind === 'army' ? gl.unit : (gl as { item: string }).item}:${x.done}`
      const n = free.get(key) ?? 0
      if (n > 0) {
        free.set(key, n - 1)
        drop.add(i)
      }
    })
    if (drop.size) {
      for (const i of drop) {
        const gl = list[i].goal
        skipped.add(`${gl.kind === 'army' ? gl.unit : (gl as { item: string }).item}（${unpaid.label}）`)
      }
      const keep = list.filter((_, i) => !drop.has(i))
      // 單位目標的數量是累計的：拿掉免費的之後重新編號
      const n = new Map<string, number>()
      for (const x of keep) if (x.goal.kind === 'army') {
        n.set(x.goal.unit, (n.get(x.goal.unit) ?? 0) + 1)
        x.goal = { ...x.goal, count: n.get(x.goal.unit)! }
      }
      list.length = 0
      list.push(...keep)
    }
  }
  list.sort((a, b) => a.key - b.key)
  return { goals: list.map((x) => x.goal), proDone: list.map((x) => x.done), skipped: [...skipped], builders, extra, goalBuilders: list.map((x) => x.builders) }
}

function campRes(data: CivData, s: Sample, id: string, done: number): 'food' | 'wood' | 'gold' | 'stone' | undefined {
  const rs = (['food', 'wood', 'gold', 'stone'] as const).filter((r) => data.spec.dropoff[r].includes(id))
  if (rs.length < 2) return undefined
  const g = s.gathered!
  const at = (r: (typeof rs)[number], x: number) => {
    const i = g.t.findIndex((y) => y >= x)
    return g[r][i < 0 ? g.t.length - 1 : i]
  }
  // 只在訊號明確時才指定（每秒多 0.5 以上、而且是第二名的 3 倍以上）；開局同時蓋的營地、多用途的蒙古包分不出來，不指定
  const gains = rs.map((r) => ({ r, d: (at(r, done + 60) - at(r, done)) / 60 - (at(r, done) - at(r, done - 40)) / 40 })).sort((a, b) => b.d - a.d)
  const [a, b] = gains
  return a.d >= 0.5 && a.d >= 3 * Math.max(0, b?.d ?? 0) ? a.r : undefined
}

/**
 * 職業的市場交易：累計收入（花費 + 庫存 − 開局）減掉實際採集（每分鐘採集量 perMin 往回累加：G(t) = perMin(t) + G(t − 60)）。
 * 某種資源多出來的跳一格 ≥ 40：
 *   - 食物／木材／石頭多了，而且那一格黃金花了至少這麼多：用黃金買的（價格 = 那一格的黃金花費，每單位最多 1.6 黃金）；
 *   - 黃金多了，而且那一格有另一種資源花了 100 以上：賣掉那種資源（每 100 換約 70 黃金，照多出的黃金推算賣了幾批）。
 * 沒有對應付款的（阿尤布工業側翼送的木材、蘇格蘭教士的黃金等）不是交易，模擬自己的模型會給，不另外加。
 * 2026-11-07 用 30 場對過：其他時候多出來的都是 0（被動收入都算在 perMin 裡）。摘要裡沒有交易紀錄，只能這樣推算。
 */
function tradesOf(s: Sample): NonNullable<ReplayScript['trades']> {
  const g = s.gathered as any
  if (!g?.perMin?.wood || !g.spent) return []
  const RES = ['food', 'wood', 'gold', 'stone'] as const
  const ex: Record<string, number[]> = {}
  for (const r of RES) {
    const pm = g.perMin[r] as number[]
    const G: number[] = []
    for (let i = 0; i < g.t.length; i++) {
      const j = g.t.findIndex((x: number) => x >= g.t[i] - 60 - 1e-6)
      G[i] = (pm[i] ?? 0) + (j >= 0 && j < i && g.t[i] - g.t[j] >= 59 ? G[j] : 0)
    }
    ex[r] = g[r].map((x: number, i: number) => x - G[i])
  }
  const out: NonNullable<ReplayScript['trades']> = []
  for (let i = 1; i < g.t.length; i++) {
    const d = (r: (typeof RES)[number]) => ex[r][i] - ex[r][i - 1]
    const sp = (r: (typeof RES)[number]) => g.spent[r][i] - g.spent[r][i - 1]
    for (const r of ['food', 'wood', 'stone'] as const) {
      const n = d(r)
      if (n < 40 || sp('gold') < n * 0.9) continue
      out.push({ t: g.t[i - 1], pay: { gold: Math.round(n * Math.min(1.6, sp('gold') / n)) }, get: { [r]: Math.round(n) } })
    }
    const ng = d('gold')
    if (ng >= 40) {
      const sold = (['food', 'wood', 'stone'] as const).filter((r) => sp(r) >= 100).sort((a, b) => sp(b) - sp(a))[0]
      if (sold) {
        const lots = Math.max(1, Math.min(Math.floor(sp(sold) / 100), Math.round(ng / 70)))
        out.push({ t: g.t[i - 1], pay: { [sold]: lots * 100 }, get: { gold: Math.round(ng) } })
      }
    }
  }
  return out
}

function scriptOf(data: CivData, s: Sample): ReplayScript | null {
  const g = s.gathered
  if (!g?.income) return null
  return {
    villagers: s.villagers.map(([t]) => t),
    workerIds: s.villagers.map(([, id]) => id),
    officials: data.spec.officials ? s.units.filter(([, id]) => id === data.spec.officials!.unit).map(([t]) => t) : undefined,
    scholars: data.spec.scholars ? s.units.filter(([, id]) => id === data.spec.scholars!.unit).map(([t]) => t) : undefined,
    support: Object.fromEntries((data.spec.support ?? []).map((su) => [su.unit, s.units.filter(([, id]) => id === su.unit).map(([t]) => t)])),
    farms: s.buildings.filter(([, id]) => id === data.spec.farm.id).map(([t]) => t),
    income: { t: g.t, food: g.food, wood: g.wood, gold: g.gold, stone: g.stone },
    trades: tradesOf(s),
    dropoffsMoved: UNPAID[s.civ]?.kind === 'build',
    perMin: (g as any).perMin ?? undefined,
    // 投放點的完成時間減建造時間（一人蓋）當作開始蓋的時間
    // 同時收好幾種資源的投放點（採礦營地收金和石）：蓋好後 60 秒內收入速率增加最多的那種資源，就是這座營地給誰用的
    dropoffs: s.buildings.filter(([, id]) => isDropoff(data, id)).map(([t, id]) => ({ t: t - (data.items.get(id)?.variations[0]?.time ?? 20), id, res: campRes(data, s, id, t) })),
    // 這個文明所有職業對局都沒有紀錄的投放點（圖格魯克工作象在摘要裡看不到）：照模擬自己的判斷蓋
    untracked: [...new Set(Object.values(data.spec.dropoff).flat())].filter((id) => !pro.samples.some((x: Sample) => x.civ === s.civ && x.buildings.some(([, b]) => b === id))),
  }
}

/** 職業在 t 秒的累計收入（四種資源合計，線性內插） */
function proIncome(s: Sample, t: number) {
  const g = s.gathered
  if (!g?.income || !g.t.length) return null
  const sum = (i: number) => g.food[i] + g.wood[i] + g.gold[i] + g.stone[i]
  const i = g.t.findIndex((x) => x >= t)
  if (i < 0) return null
  if (i === 0) return sum(0)
  const f = (t - g.t[i - 1]) / (g.t[i] - g.t[i - 1])
  return sum(i - 1) + (sum(i) - sum(i - 1)) * f
}
const simIncome = (r: PlanResult, t: number) => {
  const x = [...r.samples].reverse().find((y) => y.t <= t)
  return x?.gathered ? x.gathered.food + x.gathered.wood + x.gathered.gold + x.gathered.stone : null
}
const med = (xs: number[]) => {
  if (!xs.length) return null
  const v = [...xs].sort((a, b) => a - b)
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
}
const sign = (x: number | null, unit = '秒') => (x == null ? '—' : `${x > 0 ? '+' : ''}${Math.round(x)}${unit}`)
const ratio = (x: number | null) => (x == null ? '—' : x.toFixed(2))

const results: Record<string, unknown>[] = []
const byCiv = new Map<string, { inc: number[]; f: number[]; c: number[]; late: number[] }>()
for (const s of pro.samples as Sample[]) {
  if (only && s.civ !== only) continue
  if (process.env.GAME && String(s.game) !== process.env.GAME) continue
  const abbr = abbrOf.get(s.civ)
  if (!abbr) continue
  const data = buildCivData(catalog, abbr, names)
  const script = scriptOf(data, s)
  if (!script) continue
  const map = generateMap('dry-arabia', 7)
  const { goals, proDone, skipped, builders, extra, goalBuilders } = goalsOf(data, s)
  const policy = defaultPolicy(data, goals)
  policy.ecoAt = {}
  policy.support = extra.support
  policy.scholars = extra.scholars
  policy.officials = extra.officials
  // 牧牛場的花費已含 3 隻牛（civSpec 的 costOverride），那些牛不另外買
  if (data.spec.herd) policy.herd = Math.max(0, extra.herd - 3 * s.buildings.filter(([t, id]) => id === 'cattle-ranch' && t <= (s.ages[3] ?? s.horizon)).length)
  for (const st of policy.steps) st.producers = 1
  // 升代地標照職業的人數蓋（步驟和目標對應：找升到該時代的那一步）
  {
    const { steps } = resolveGoals(data, goals, policy.landmarkPick)
    steps.forEach((st, k) => {
      if (st.kind === 'age' && st.age != null && builders[st.age] != null && policy.steps[k]) policy.steps[k].builders = builders[st.age]
      // 一般建築：照職業的人數蓋
      const gb = goalBuilders[st.goalIndex]
      if (st.kind === 'build' && !st.implicit && gb != null && policy.steps[k]) policy.steps[k].builders = gb
    })
  }
  const ideal = evaluate(data, map, goals, policy, 3600, true, { post: { units: 0, upgrades: 0 }, script })?.result ?? null
  if (!ideal) continue
  const goalT = (r: PlanResult, i: number) => r.goals.find((g) => g.goalIndex === i)?.t ?? null
  const ageIdx = (a: number) => goals.findIndex((g) => g.kind === 'age' && g.age === a)
  const fi = ageIdx(2)
  const ci = ageIdx(3)
  const feudal = { pro: s.ages[2]!, ideal: goalT(ideal, fi) }
  const castle = ci >= 0 ? { pro: s.ages[3]!, ideal: goalT(ideal, ci) } : null
  // 收入：模擬 ÷ 職業，在職業最後一次升代（或模擬更早結束時）的時間點
  const end = Math.min(castle?.pro ?? feudal.pro, ideal.finish)
  const pInc = proIncome(s, end)
  const sInc = simIncome(ideal, end)
  const inc = pInc && sInc != null ? sInc / pInc : null
  // 各資源分開：模擬÷ 職業
  const byRes: Partial<Record<'food' | 'wood' | 'gold' | 'stone', number>> = {}
  {
    const g = s.gathered!
    const i = g.t.findIndex((x) => x >= end)
    const x = [...ideal.samples].reverse().find((y) => y.t <= end)
    if (i > 0 && x?.gathered) for (const k of ['food', 'wood', 'gold', 'stone'] as const) if (g[k][i] > 100) byRes[k] = Math.round((x.gathered[k] / g[k][i]) * 100) / 100
  }
  // 每個動作完成的延遲
  const late = goals
    .map((_, i) => {
      const t = goalT(ideal, i)
      return t != null && Number.isFinite(t) ? t - proDone[i] : null
    })
    .filter((x): x is number => x != null)
  const row = { civ: s.civ, game: s.game, player: s.name, rating: s.rating, map: s.map, goals: goals.length, skipped, feudal, castle, income: inc, incomeByRes: byRes, lateMedian: med(late), unfinished: goals.length - late.length }
  // 逐分鐘對帳：各資源累計收入差（模擬 − 職業）、村民數差
  const lag: Record<string, number>[] = []
  {
    const g = s.gathered!
    for (let tt = 60; tt <= Math.min(end, 600); tt += 60) {
      const i = g.t.findIndex((x) => x >= tt)
      const x = [...ideal.samples].reverse().find((y) => y.t <= tt)
      if (i < 0 || !x?.gathered) break
      const pv = Object.values(data.spec.startWorkers).reduce((a2, b2) => a2 + b2, 0) + s.villagers.filter(([v]) => v <= tt).length
      lag.push({ t: tt, food: Math.round(x.gathered.food - g.food[i]), wood: Math.round(x.gathered.wood - g.wood[i]), gold: Math.round(x.gathered.gold - g.gold[i]), stone: Math.round(x.gathered.stone - g.stone[i]), vills: x.villagers - pv })
    }
  }
  ;(row as Record<string, unknown>).lag = lag
  if (process.env.GAME) for (const l of lag) console.log(`    累計差 ${clock(l.t)} 食${l.food} 木${l.wood} 金${l.gold} 石${l.stone} 村民${l.vills}`)
  // 職業開始升封建的時間：花費序列裡地標／升代科技的費用入帳（20 秒一筆，取那一格的起點）
  {
    const g = s.gathered!
    const fg = goals[fi]
    const opt = fg && fg.kind === 'age' ? (data.ageOptions[2] ?? []).find((o) => o.id === fg.via) : undefined
    if (opt && g.spent) {
      let ts: number | null = null
      for (let i = 1; i < g.t.length && g.t[i] <= s.ages[2]! + 20; i++) {
        const df = g.spent.food[i] - g.spent.food[i - 1]
        const dg = g.spent.gold[i] - g.spent.gold[i - 1]
        if (df >= opt.cost.food * 0.9 && dg >= opt.cost.gold * 0.9) ts = g.t[i - 1]
      }
      if (ts != null) {
        const i = g.t.findIndex((x) => x >= ts!)
        const x = [...ideal.samples].reverse().find((y) => y.t <= ts!)
        if (x?.gathered) {
          const st = data.spec.start
          const d: Record<string, number> = { t: ts, simPlace: ideal.events.find((e) => e.item === opt.id && (e.kind === 'place' || e.kind === 'research'))?.t ?? -1 }
          for (const k of ['food', 'wood', 'gold', 'stone'] as const) {
            d[k + 'Inc'] = Math.round(x.gathered[k] - g[k][i])
            d[k + 'Spent'] = Math.round(x.gathered[k] + st[k] - x.bank[k] - g.spent[k][i])
            d[k + 'Bank'] = Math.round(x.bank[k] - g.stock[k][i])
          }
          ;(row as Record<string, unknown>).atFeudalStart = d
        }
      }
    }
  }
  results.push(row)
  const agg = byCiv.get(s.civ) ?? { inc: [], f: [], c: [], late: [] }
  if (inc != null) agg.inc.push(inc)
  if (feudal.ideal != null && Number.isFinite(feudal.ideal)) agg.f.push(feudal.ideal - feudal.pro)
  if (castle?.ideal != null && Number.isFinite(castle.ideal)) agg.c.push(castle.ideal - castle.pro)
  if (row.lateMedian != null) agg.late.push(row.lateMedian)
  byCiv.set(s.civ, agg)
  console.log(
    `${s.civ.padEnd(20)} ${s.name.slice(0, 14).padEnd(14)} ${String(s.rating).padStart(4)}  收入 ×${ratio(inc)}  封建 職業 ${clock(feudal.pro)} 模擬 ${clock(feudal.ideal)}` +
      (castle ? `  城堡 職業 ${clock(castle.pro)} 模擬 ${clock(castle.ideal)}` : '') +
      `  動作延遲 ${sign(row.lateMedian)}（${goals.length} 個${row.unfinished ? `，${row.unfinished} 個沒完成` : ''}）${skipped.length ? `  略過 ${skipped.join(',')}` : ''}`,
  )
  if (process.env.GAME) {
    goals.forEach((g, i) => console.log(`  ${String(i).padStart(3)} ${JSON.stringify(g)} 職業 ${clock(proDone[i])} 模擬 ${clock(goalT(ideal, i))}`))
    for (const w of ideal.warnings) console.log('  警告：' + w)
    // 模擬每分鐘各資源：採集人數（含走在路上的）、收入、每人每分鐘
    for (let tt = 60; tt <= end + 1; tt += 60) {
      const x = [...ideal.samples].reverse().find((y) => y.t <= tt)
      const y0 = [...ideal.samples].reverse().find((y) => y.t <= tt - 60)
      if (!x?.gathered || !y0?.gathered) continue
      const parts = (['food', 'wood', 'gold', 'stone'] as const).map((k) => {
        const inc = x.gathered![k] - y0.gathered![k]
        const w = x.split[k]
        return `${k} ${w} 人 ${Math.round(inc)}/分（每人 ${w ? (inc / w).toFixed(0) : '—'}）`
      })
      console.log(`    人力 ${clock(tt)} ${parts.join('  ')}  走 ${x.walking} 蓋 ${x.building}`)
    }
    // SITES=a-b：那段時間每 20 秒各採集點的人數、剩餘量、每人每分鐘速率
    if (process.env.SITES) {
      const [a, b] = process.env.SITES.split('-').map(Number)
      for (const x of ideal.samples.filter((y) => y.t >= a && y.t <= b && Math.round(y.t) % 20 === 0))
        console.log(`    採集點 ${clock(x.t)} ${x.sites.filter((y) => y.workers > 0 || (y.left > 0 && y.left < 1e9 && y.id !== 'farm')).map((y) => `${y.id}:${y.workers}人/剩${Math.round(y.left)}@${y.rate ?? '-'}`).join(' ')}`)
    }
    if (process.env.DUMP) {
      const [a, b] = process.env.DUMP.split('-').map(Number)
      for (const e of ideal.events.filter((e) => (e.kind === 'rally' || e.kind === 'villager') && e.t >= a && e.t <= b)) console.log(`    派工 ${clock(e.t)} ${e.text}`)
      for (const x of ideal.samples.filter((y) => y.t >= a && y.t <= b)) console.log(`    樣本 ${clock(x.t)} 庫存 ${Object.values(x.bank).map((v) => Math.round(v)).join('/')} 村民 ${x.villagers} 人口 ${x.pop}/${x.popCap} 蓋 ${x.building} 走 ${x.walking}`)
    }
    for (const e of ideal.events.filter((e) => (e.kind === 'place' || e.kind === 'research' || e.kind === 'age' || e.kind === 'train' || (process.env.DONE && e.kind === 'done') || (process.env.NOTES && e.kind === 'note')) && e.t <= end + 1)) console.log(`    理論 ${clock(e.t)} ${e.text}  [${Object.values(e.bank).map((v) => Math.round(v)).join('/')}]`)
    for (let t = 60; t <= end + 1; t += 60) {
      const p = (proIncome(s, t) ?? 0) - (proIncome(s, t - 60) ?? 0)
      const m = (simIncome(ideal, t) ?? 0) - (simIncome(ideal, t - 60) ?? 0)
      const x = [...ideal.samples].reverse().find((y) => y.t <= t)
      console.log(`    ${clock(t)} 收入/分 職業 ${Math.round(p)} 模擬 ${Math.round(m)}（×${(m / Math.max(1, p)).toFixed(2)}）  村民 ${x?.villagers} 走 ${x?.walking} 蓋 ${x?.building} 閒 ${x?.idle}  ${x?.sites.filter((y) => y.workers > 0).map((y) => `${y.id}:${y.workers}@${y.rate}`).join(' ')}`)
    }
  }
}
console.log('\n文明（收入 = 模擬 ÷ 職業；時間 = 模擬 − 職業，中位數）')
const summary: Record<string, unknown> = {}
for (const [civ, a] of [...byCiv].sort()) {
  summary[civ] = { n: a.f.length, income: med(a.inc), feudal: med(a.f), castle: med(a.c), castleN: a.c.length, actionLate: med(a.late) }
  console.log(`${civ.padEnd(20)} ${a.f.length} 場  收入 ×${ratio(med(a.inc))}  封建 ${sign(med(a.f))}  城堡 ${sign(med(a.c))}（${a.c.length} 場）  動作延遲 ${sign(med(a.late))}`)
}
const all = [...byCiv.values()]
// 在職業開始升封建那一刻：模擬 − 職業（收入、花費、庫存）
{
  const rows = results.map((r) => r.atFeudalStart as Record<string, number> | undefined).filter((x): x is Record<string, number> => !!x)
  const m = (k: string) => Math.round(med(rows.map((x) => x[k]))!)
  console.log(`開始升封建時（${rows.length} 場）模擬 − 職業：收入 食${m('foodInc')} 木${m('woodInc')} 金${m('goldInc')} 石${m('stoneInc')}  花費 食${m('foodSpent')} 木${m('woodSpent')} 金${m('goldSpent')} 石${m('stoneSpent')}  庫存 食${m('foodBank')} 木${m('woodBank')} 金${m('goldBank')} 石${m('stoneBank')}  模擬放下 − 職業 ${med(rows.map((x) => x.simPlace - x.t))} 秒`)
}
// 逐分鐘：所有場次的中位數
for (let tt = 60; tt <= 600; tt += 60) {
  const rows = results.map((r) => (r.lag as Record<string, number>[] | undefined)?.find((x) => x.t === tt)).filter((x): x is Record<string, number> => !!x)
  if (rows.length < 5) break
  const m = (k: string) => Math.round(med(rows.map((x) => x[k]))!)
  console.log(`${clock(tt)}（${rows.length} 場）累計收入差 食物 ${m('food')} 木材 ${m('wood')} 黃金 ${m('gold')} 石頭 ${m('stone')}  村民差 ${m('vills')}`)
}
for (const k of ['food', 'wood', 'gold', 'stone'] as const) {
  const xs = results.map((r) => (r.incomeByRes as Record<string, number>)[k]).filter((x): x is number => x != null)
  console.log(`各資源收入（模擬 ÷ 職業）${k}: ×${ratio(med(xs))}（${xs.length} 場）`)
}
const allOf = (k: 'inc' | 'f' | 'c' | 'late') => med(all.flatMap((a) => a[k]))
console.log(`\n全部：收入 ×${ratio(allOf('inc'))}、封建 ${sign(allOf('f'))}、城堡 ${sign(allOf('c'))}、動作延遲 ${sign(allOf('late'))}`)
if (process.env.LIST) for (const r of results) { const d = r.atFeudalStart as Record<string, number> | undefined; if (d) console.log(`LIST ${r.civ} ${r.game} ${r.player} 放下差 ${Math.round(d.simPlace - d.t)} 庫存差 食${d.foodBank} 木${d.woodBank} 金${d.goldBank} 石${d.stoneBank}`) }
if (!only && !process.env.GAME) writeFileSync(new URL('./pro-replay.json', import.meta.url), JSON.stringify({ ranAt: new Date().toISOString(), patch: pro.patch, mode: 'replay', summary, results }, null, 1) + '\n')
