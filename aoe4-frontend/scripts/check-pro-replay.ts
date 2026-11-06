// 回放職業對局，驗證模擬器：node --experimental-strip-types scripts/check-pro-replay.ts [文明 id 或 all]
// 讀 scripts/pro-games.json（fetch-pro-games.mjs 產生），讓模擬「照職業的操作做」，不跑最佳化：
//   - 每個動作（建築、單位、科技、升代）各是一個目標，不早於職業開始做的時間（完成時間減掉所需時間），照開始時間排序；
//     升代：地標 = 完成 − 建造時間 ÷ 2（預設 4 人蓋，速度 (4+2)/3 = 2 倍），升代科技 = 完成 − 研究時間；
//     要下一個時代才能做的動作排在那次升代之後。房屋、農田、投放點、城牆由模擬自己蓋（不當目標）。
//   - 城鎮中心照職業出村民的時間生產；村民照職業每 20 秒各資源的收入比例分配；職業蓋了投放點之後模擬才蓋營地。
// 每場跑兩次：理論值（沒有操作損失）與職業水準（PRO_LOSS）。比較：
//   - 收入：同一時間點的累計收入，模擬（理論值）÷ 職業。同樣的分配下，這就是採集模型的準確度（< 1 表示模擬採得比職業慢）。
//   - 時間：升代時間，以及每個動作完成時間的延遲（模擬 − 職業，中位數）。
// 地圖一律用乾燥阿拉伯（唯一有實測距離的地圖）。GAME=<對局 id> 印出逐目標與逐分鐘的除錯資訊。
// 輸出：scripts/pro-replay.json（跑全部文明時才寫）
import { readFileSync, writeFileSync } from 'node:fs'
import { buildCivData, isBuildable, isTownCenter, minAge, variationAt, type CivData } from '../src/sim/planner/civData.ts'
import { generateMap } from '../src/sim/planner/mapgen.ts'
import { defaultPolicy, evaluate } from '../src/sim/planner/search.ts'
import { PRO_LOSS, type Goal, type PlanResult, type ReplayScript } from '../src/sim/planner/types.ts'
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
function goalsOf(data: CivData, s: Sample) {
  const end = s.ages[3] ?? s.ages[2]!
  const ageIds = new Set(Object.values(data.ageOptions).flat().map((o) => o.id))
  const skipped = new Set<string>()
  const list: { key: number; goal: Goal; done: number }[] = []
  // 升代：用職業紀錄裡出現的地標／升代科技
  const ageStart: Record<number, number> = {}
  for (const a of [2, 3]) {
    const done = s.ages[a]
    if (done == null) continue
    const used = new Set([...s.buildings, ...s.techs].filter(([t]) => t <= done + 1).map(([, id]) => id))
    const opt = (data.ageOptions[a] ?? []).find((o) => used.has(o.id))
    const start = opt ? done - (opt.mode === 'building' ? opt.time / 2 : opt.time) : done - 60
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
    const start = t - durOf(id)
    list.push({ key: after(id, start), done: t, goal: { kind: 'build', item: id, count: 1, at: Math.max(0, start) } })
  }
  const unitCount = new Map<string, number>()
  for (const [t, id] of s.units) {
    if (t > end || !known(id)) continue
    const it = data.items.get(id)!
    if (!it.military || data.spec.notMilitary.includes(id)) continue
    unitCount.set(id, (unitCount.get(id) ?? 0) + 1)
    const start = t - durOf(id)
    list.push({ key: after(id, start), done: t, goal: { kind: 'army', unit: id, count: unitCount.get(id)!, at: Math.max(0, start) } })
  }
  for (const [t, id] of s.techs) {
    if (t > end || !known(id)) continue
    if (ageIds.has(id) || data.items.get(id)!.kind !== 'technology') continue
    const start = t - durOf(id)
    list.push({ key: after(id, start), done: t, goal: { kind: 'tech', item: id, at: Math.max(0, start) } })
  }
  list.sort((a, b) => a.key - b.key)
  return { goals: list.map((x) => x.goal), proDone: list.map((x) => x.done), skipped: [...skipped] }
}

function scriptOf(data: CivData, s: Sample): ReplayScript | null {
  const g = s.gathered
  if (!g?.income) return null
  return {
    villagers: s.villagers.map(([t]) => t),
    income: { t: g.t, food: g.food, wood: g.wood, gold: g.gold, stone: g.stone },
    // 投放點的完成時間減 20 秒當作開始蓋的時間
    dropoffs: s.buildings.filter(([, id]) => isDropoff(data, id)).map(([t, id]) => ({ t: t - 20, id })),
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
const byCiv = new Map<string, { inc: number[]; f: number[]; c: number[]; fi: number[]; ci: number[]; late: number[] }>()
for (const s of pro.samples as Sample[]) {
  if (only && s.civ !== only) continue
  if (process.env.GAME && String(s.game) !== process.env.GAME) continue
  const abbr = abbrOf.get(s.civ)
  if (!abbr) continue
  const data = buildCivData(catalog, abbr, names)
  const script = scriptOf(data, s)
  if (!script) continue
  const map = generateMap('dry-arabia', 7)
  const { goals, proDone, skipped } = goalsOf(data, s)
  const policy = defaultPolicy(data, goals)
  policy.ecoAt = {}
  for (const st of policy.steps) st.producers = 1
  const run = (loss: boolean) =>
    evaluate(data, map, goals, policy, 3600, true, { post: { units: 0, upgrades: 0 }, script, ...(loss ? { opDelay: PRO_LOSS.delay, efficiency: PRO_LOSS.efficiency } : {}) })?.result ?? null
  const ideal = run(false)
  const real = run(true)
  if (!ideal || !real) continue
  const goalT = (r: PlanResult, i: number) => r.goals.find((g) => g.goalIndex === i)?.t ?? null
  const ageIdx = (a: number) => goals.findIndex((g) => g.kind === 'age' && g.age === a)
  const fi = ageIdx(2)
  const ci = ageIdx(3)
  const feudal = { pro: s.ages[2]!, ideal: goalT(ideal, fi), real: goalT(real, fi) }
  const castle = ci >= 0 ? { pro: s.ages[3]!, ideal: goalT(ideal, ci), real: goalT(real, ci) } : null
  // 收入：理論值模擬 ÷ 職業，在職業最後一次升代（或模擬更早結束時）的時間點
  const end = Math.min(castle?.pro ?? feudal.pro, ideal.finish)
  const pInc = proIncome(s, end)
  const sInc = simIncome(ideal, end)
  const inc = pInc && sInc != null ? sInc / pInc : null
  // 各資源分開：模擬（理論值）÷ 職業
  const byRes: Partial<Record<'food' | 'wood' | 'gold' | 'stone', number>> = {}
  {
    const g = s.gathered!
    const i = g.t.findIndex((x) => x >= end)
    const x = [...ideal.samples].reverse().find((y) => y.t <= end)
    if (i > 0 && x?.gathered) for (const k of ['food', 'wood', 'gold', 'stone'] as const) if (g[k][i] > 100) byRes[k] = Math.round((x.gathered[k] / g[k][i]) * 100) / 100
  }
  // 每個動作完成的延遲（職業水準）
  const late = goals
    .map((_, i) => {
      const t = goalT(real, i)
      return t != null && Number.isFinite(t) ? t - proDone[i] : null
    })
    .filter((x): x is number => x != null)
  const row = { civ: s.civ, game: s.game, player: s.name, rating: s.rating, map: s.map, goals: goals.length, skipped, feudal, castle, income: inc, incomeByRes: byRes, lateMedian: med(late), unfinished: goals.length - late.length }
  results.push(row)
  const agg = byCiv.get(s.civ) ?? { inc: [], f: [], c: [], fi: [], ci: [], late: [] }
  if (inc != null) agg.inc.push(inc)
  if (feudal.real != null && Number.isFinite(feudal.real)) agg.f.push(feudal.real - feudal.pro)
  if (feudal.ideal != null && Number.isFinite(feudal.ideal)) agg.fi.push(feudal.ideal - feudal.pro)
  if (castle?.real != null && Number.isFinite(castle.real)) agg.c.push(castle.real - castle.pro)
  if (castle?.ideal != null && Number.isFinite(castle.ideal)) agg.ci.push(castle.ideal - castle.pro)
  if (row.lateMedian != null) agg.late.push(row.lateMedian)
  byCiv.set(s.civ, agg)
  console.log(
    `${s.civ.padEnd(20)} ${s.name.slice(0, 14).padEnd(14)} ${String(s.rating).padStart(4)}  收入 ×${ratio(inc)}  封建 職業 ${clock(feudal.pro)} 理論 ${clock(feudal.ideal)} 職業水準 ${clock(feudal.real)}` +
      (castle ? `  城堡 職業 ${clock(castle.pro)} 理論 ${clock(castle.ideal)} 職業水準 ${clock(castle.real)}` : '') +
      `  動作延遲 ${sign(row.lateMedian)}（${goals.length} 個${row.unfinished ? `，${row.unfinished} 個沒完成` : ''}）${skipped.length ? `  略過 ${skipped.join(',')}` : ''}`,
  )
  if (process.env.GAME) {
    goals.forEach((g, i) => console.log(`  ${String(i).padStart(3)} ${JSON.stringify(g)} 職業 ${clock(proDone[i])} 模擬 ${clock(goalT(real, i))}`))
    for (const w of real.warnings) console.log('  警告：' + w)
    for (const e of ideal.events.filter((e) => (e.kind === 'place' || e.kind === 'research' || e.kind === 'age' || e.kind === 'train') && e.t <= end + 1)) console.log(`    理論 ${clock(e.t)} ${e.text}  [${Object.values(e.bank).map((v) => Math.round(v)).join('/')}]`)
    for (let t = 60; t <= end + 1; t += 60) {
      const p = (proIncome(s, t) ?? 0) - (proIncome(s, t - 60) ?? 0)
      const m = (simIncome(ideal, t) ?? 0) - (simIncome(ideal, t - 60) ?? 0)
      const x = [...ideal.samples].reverse().find((y) => y.t <= t)
      console.log(`    ${clock(t)} 收入/分 職業 ${Math.round(p)} 模擬 ${Math.round(m)}（×${(m / Math.max(1, p)).toFixed(2)}）  村民 ${x?.villagers} 走 ${x?.walking} 蓋 ${x?.building} 閒 ${x?.idle}  ${x?.sites.filter((y) => y.workers > 0).map((y) => `${y.id}:${y.workers}`).join(' ')}`)
    }
  }
}
console.log('\n文明（收入 = 理論值模擬 ÷ 職業；時間 = 模擬 − 職業，中位數）')
const summary: Record<string, unknown> = {}
for (const [civ, a] of [...byCiv].sort()) {
  summary[civ] = { n: a.f.length, income: med(a.inc), feudalIdeal: med(a.fi), feudal: med(a.f), castleIdeal: med(a.ci), castle: med(a.c), castleN: a.c.length, actionLate: med(a.late) }
  console.log(`${civ.padEnd(20)} ${a.f.length} 場  收入 ×${ratio(med(a.inc))}  封建 理論 ${sign(med(a.fi))} 職業水準 ${sign(med(a.f))}  城堡 理論 ${sign(med(a.ci))} 職業水準 ${sign(med(a.c))}（${a.c.length} 場）  動作延遲 ${sign(med(a.late))}`)
}
const all = [...byCiv.values()]
for (const k of ['food', 'wood', 'gold', 'stone'] as const) {
  const xs = results.map((r) => (r.incomeByRes as Record<string, number>)[k]).filter((x): x is number => x != null)
  console.log(`各資源收入（模擬理論值 ÷ 職業）${k}: ×${ratio(med(xs))}（${xs.length} 場）`)
}
const allOf = (k: 'inc' | 'f' | 'c' | 'fi' | 'ci' | 'late') => med(all.flatMap((a) => a[k]))
console.log(`\n全部：收入 ×${ratio(allOf('inc'))}、封建 理論 ${sign(allOf('fi'))} 職業水準 ${sign(allOf('f'))}、城堡 理論 ${sign(allOf('ci'))} 職業水準 ${sign(allOf('c'))}、動作延遲 ${sign(allOf('late'))}`)
if (!only && !process.env.GAME) writeFileSync(new URL('./pro-replay.json', import.meta.url), JSON.stringify({ ranAt: new Date().toISOString(), patch: pro.patch, mode: 'replay', loss: PRO_LOSS, summary, results }, null, 1) + '\n')
