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
function goalsOf(data: CivData, s: Sample) {
  const end = s.ages[3] ?? s.ages[2]!
  const ageIds = new Set(Object.values(data.ageOptions).flat().map((o) => o.id))
  const skipped = new Set<string>()
  const list: { key: number; goal: Goal; done: number; builders?: number }[] = []
  // 升代：用職業紀錄裡出現的地標／升代科技
  const ageStart: Record<number, number> = {}
  /** 升代地標的建造人數（由職業的建造時間反推） */
  const builders: Record<number, number> = {}
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
        if (g.spent.food[i] - g.spent.food[i - 1] >= opt.cost.food * 0.9 && g.spent.gold[i] - g.spent.gold[i - 1] >= opt.cost.gold * 0.9) ts = g.t[i - 1]
      }
      if (ts != null && ts < done) {
        start = ts
        // 地標：由職業的建造時間反推派了幾個人（建造速度 (人數 + 2) ÷ 3），模擬照同樣人數蓋
        if (opt.mode === 'building') builders[a] = Math.max(1, Math.min(15, Math.round((3 * opt.time) / Math.max(1, done - (ts + 10)) - 2)))
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
        if (ok) ts = g.t[i - 1]
      }
      if (ts != null && ts < t) {
        start = ts
        nb = Math.max(1, Math.min(15, Math.round((3 * durOf(id)) / Math.max(1, t - (ts + 10)) - 2)))
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
  for (const [t, id] of s.techs) {
    if (t > end || !known(id)) continue
    if (ageIds.has(id) || data.items.get(id)!.kind !== 'technology') continue
    const start = t - durOf(id)
    list.push({ key: after(id, start), done: t, goal: { kind: 'tech', item: id, at: Math.max(0, start) } })
  }
  list.sort((a, b) => a.key - b.key)
  return { goals: list.map((x) => x.goal), proDone: list.map((x) => x.done), skipped: [...skipped], builders, extra, goalBuilders: list.map((x) => x.builders) }
}

function scriptOf(data: CivData, s: Sample): ReplayScript | null {
  const g = s.gathered
  if (!g?.income) return null
  return {
    villagers: s.villagers.map(([t]) => t),
    officials: data.spec.officials ? s.units.filter(([, id]) => id === data.spec.officials!.unit).map(([t]) => t) : undefined,
    scholars: data.spec.scholars ? s.units.filter(([, id]) => id === data.spec.scholars!.unit).map(([t]) => t) : undefined,
    farms: s.buildings.filter(([, id]) => id === data.spec.farm.id).map(([t]) => t),
    income: { t: g.t, food: g.food, wood: g.wood, gold: g.gold, stone: g.stone },
    // 投放點的完成時間減建造時間（一人蓋）當作開始蓋的時間
    dropoffs: s.buildings.filter(([, id]) => isDropoff(data, id)).map(([t, id]) => ({ t: t - (data.items.get(id)?.variations[0]?.time ?? 20), id })),
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
    if (process.env.DUMP) {
      const [a, b] = process.env.DUMP.split('-').map(Number)
      for (const e of ideal.events.filter((e) => (e.kind === 'rally' || e.kind === 'villager') && e.t >= a && e.t <= b)) console.log(`    派工 ${clock(e.t)} ${e.text}`)
      for (const x of ideal.samples.filter((y) => y.t >= a && y.t <= b)) console.log(`    樣本 ${clock(x.t)} 庫存 ${Object.values(x.bank).map((v) => Math.round(v)).join('/')} 村民 ${x.villagers} 人口 ${x.pop}/${x.popCap} 蓋 ${x.building} 走 ${x.walking}`)
    }
    for (const e of ideal.events.filter((e) => (e.kind === 'place' || e.kind === 'research' || e.kind === 'age' || e.kind === 'train' || (process.env.DONE && e.kind === 'done')) && e.t <= end + 1)) console.log(`    理論 ${clock(e.t)} ${e.text}  [${Object.values(e.bank).map((v) => Math.round(v)).join('/')}]`)
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
