// 比對規劃器的開局設定（civSpec）和實際對局（scripts/start-conditions.json，由 fetch-start-conditions.mjs 產生）。
// 用法：node --experimental-strip-types scripts/check-start-conditions.ts
// 對照：資源 → start / startOther；工人 → startWorkers；其他單位 → extraPop；羊 → ownedSheep；其他動物 → startHunt
import { readFileSync } from 'node:fs'
import { civSpec } from '../src/sim/planner/civSpec.ts'

const doc = JSON.parse(readFileSync(new URL('./start-conditions.json', import.meta.url), 'utf8'))
const catalog = JSON.parse(readFileSync(new URL('../public/sim/catalog.json', import.meta.url), 'utf8'))
const abbrOf = new Map<string, string>(catalog.civilizations.map((c: { id: string; abbr: string }) => [c.id, c.abbr]))

// 圖示名稱 → 規劃器的工人 id（不在表裡的單位都算非工人）
const WORKER: Record<string, string> = {
  villager: 'villager',
  gilded_villager: 'gilded-villager',
  mounted_villager: 'mounted-villager',
  villager_jin: 'mounted-villager',
  jeanne_villager: 'jeanne-darc-peasant',
}
const isWorkerIcon = (name: string) => name in WORKER || /villager|peasant/.test(name)
const STD_RES = ['food', 'wood', 'gold', 'stone']
// 0 人口的牲畜（摘要記成 Unit）：蘇格蘭高地牛，模型用首都城鎮中心的被動食物表示
const LIVESTOCK = new Set(['highland_cattle'])
// AoE4 World 摘要的資源序列只有食木金石（拜占庭另有橄欖油），其他特殊資源無法用摘要驗證
const UNTRACKED_OTHER = new Set(['silver', 'vizier', 'muster'])

let diffs = 0
for (const [civ, s] of Object.entries<any>(doc.summary)) {
  const abbr = abbrOf.get(civ)
  if (!abbr) { console.log(`?? ${civ}：目錄裡沒有這個文明`); continue }
  const spec = civSpec(abbr)
  const res = s.resources.value as Record<string, number>
  const ent = s.entities.value as Record<string, number>
  const rows: string[] = []
  // 物件依鍵排序後再比，鍵的順序不同不算差異
  const norm = (v: unknown) => JSON.stringify(v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y))) : v)
  const cmp = (label: string, real: unknown, model: unknown) => {
    const a = norm(real), b = norm(model)
    if (a !== b) rows.push(`  ✗ ${label}：實際 ${a}，模型 ${b}`)
  }

  for (const r of STD_RES) cmp(r, res[r] ?? 0, (spec.start as Record<string, number>)[r] ?? 0)
  const otherReal: Record<string, number> = {}
  for (const [k, v] of Object.entries(res)) if (!STD_RES.includes(k) && v) otherReal[k] = v
  const otherModel = Object.fromEntries(Object.entries(spec.startOther).filter(([k, v]) => v && !UNTRACKED_OTHER.has(k)))
  cmp('特殊資源', otherReal, otherModel)
  for (const [k, v] of Object.entries(spec.startOther)) if (v && UNTRACKED_OTHER.has(k)) rows.push(`  · ${k} ${v}：摘要不記錄，無法驗證`)

  const workers: Record<string, number> = {}
  const others: Record<string, number> = {}
  const animals: Record<string, number> = {}
  const buildings: Record<string, number> = {}
  for (const [key, n] of Object.entries(ent)) {
    const [type, name] = key.split(':')
    if (type === 'Unit' && LIVESTOCK.has(name)) animals[name] = n
    else if (type === 'Unit') (isWorkerIcon(name) ? workers : others)[WORKER[name] ?? name] = n
    else if (type === 'Animal') animals[name] = n
    else if (type === 'Building' && !/town_cent/.test(name)) buildings[name] = n
  }
  cmp('工人', workers, Object.fromEntries(Object.entries(spec.startWorkers).filter(([, v]) => v)))
  const otherPop = Object.values(others).reduce((a, b) => a + b, 0)
  cmp(`非工人單位人口（${Object.entries(others).map(([k, v]) => `${k}×${v}`).join('、') || '無'}）`, otherPop, spec.extraPop)
  cmp('羊', animals.sheep ?? 0, spec.ownedSheep)
  const otherAnimals = Object.fromEntries(Object.entries(animals).filter(([k]) => k !== 'sheep'))
  if (spec.tcSheep) rows.push(`  · 城鎮中心旁另生成 ${spec.tcSheep} 隻中立羊（摘要不列，模型 tcSheep）`)
  if (Object.keys(otherAnimals).length || spec.startHunt || spec.startFood)
    rows.push(`  · 其他動物：實際 ${JSON.stringify(otherAnimals)}，模型 startHunt ${spec.startHunt}、startFood ${spec.startFood}`)
  // 蒙古開局送的收起蒙古包：模型用 freeDropoffs（第一座蒙古包投放點免費）表示
  if (buildings.ger) { cmp('開局蒙古包（freeDropoffs）', buildings.ger, spec.freeDropoffs); delete buildings.ger }
  if (Object.keys(buildings).length || spec.prebuilt.length) cmp('開局建築', buildings, Object.fromEntries(spec.prebuilt.map((b) => [b, 1])))

  const agree = `資源 ${s.resources.agree}/${s.resources.of}、單位 ${s.entities.agree}/${s.entities.of} 場一致`
  const bad = rows.filter((r) => r.includes('✗')).length
  diffs += bad
  console.log(`${bad ? '✗' : '✓'} ${abbr.padEnd(4)} ${spec.zh}（${civ}，${agree}）`)
  for (const r of rows) console.log(r)
}
console.log(doc.short.length ? `\n樣本不足：${doc.short.join('、')}` : '\n每個文明都有足夠樣本')
console.log(diffs ? `${diffs} 項和實際不同` : '全部和實際相同')
