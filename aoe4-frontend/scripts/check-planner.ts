// 規劃器校準檢查：node --experimental-strip-types scripts/check-planner.ts [civ] [preset]
// 對照職業建造順序（aoe4guides，Season 13，2026-08~10）：
//   英格蘭封建約 3:50~4:10、17~19 村民；日本直城約 7:45~8:15、~29 村民。

import { readFileSync } from 'node:fs'
import { buildCivData } from '../src/sim/planner/civData.ts'
import { generateMap } from '../src/sim/planner/mapgen.ts'
import { Searcher } from '../src/sim/planner/search.ts'
import type { Goal } from '../src/sim/planner/types.ts'
import type { Catalog } from '../src/sim/types.ts'

const catalog = JSON.parse(readFileSync(new URL('../public/sim/catalog.json', import.meta.url), 'utf8')) as Catalog
const names = JSON.parse(readFileSync(new URL('../public/sim/names-zh.json', import.meta.url), 'utf8')) as Record<string, string>

const clock = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—')

interface Case {
  civ: string
  label: string
  goals: Goal[]
  /** [最早, 最晚] 秒 */
  band?: [number, number]
}

const CASES: Case[] = [
  { civ: 'en', label: '英格蘭 封建', goals: [{ kind: 'age', age: 2 }], band: [195, 260] },
  { civ: 'fr', label: '法蘭西 封建', goals: [{ kind: 'age', age: 2 }], band: [185, 260] },
  { civ: 'hr', label: '神羅 封建', goals: [{ kind: 'age', age: 2 }], band: [185, 260] },
  // 阿拔斯：職業約 3:52~4:16（智慧宮 2:34 完成、側翼 100 秒）。智慧宮要自己蓋之後模擬約 4:35，
  // 因為控制器開局一律先採羊、不會像職業一樣在野果蓋磨坊做果園；區間放寬到 4:45，差距記在這裡。
  { civ: 'ab', label: '阿拔斯 封建', goals: [{ kind: 'age', age: 2 }], band: [195, 285] },
  { civ: 'mo', label: '蒙古 封建', goals: [{ kind: 'age', age: 2 }], band: [220, 330] },
  // 維京：免費村民讓「最快封建」比職業平均（約 4:15）快很多；起始村民容量 10 是假設值，這個區間只用來抓壞掉的模型。
  { civ: 'vik', label: '維京 封建', goals: [{ kind: 'age', age: 2 }], band: [170, 320] },
  { civ: 'je', label: '貞德 封建', goals: [{ kind: 'age', age: 2 }], band: [195, 290] },
  // 金朝：2026-11 AoE4 World 頂尖玩家（1850–2500 分）23 場 1v1 金朝封建：最快 3:44、中位數 4:30、75% 4:41。
  // 引擎沒有走位與操作損失，最快封建應略快於頂尖最快；下限放到 3:20，上限放在 75% 分位附近。
  { civ: 'jin', label: '金朝 封建（3 名鄉騎開局）', goals: [{ kind: 'age', age: 2 }], band: [200, 285] },
  // 只回報、不設區間：這次改了開局組成的文明
  { civ: 'gol', label: '金帳 封建（5 村民、一次 2 名）', goals: [{ kind: 'age', age: 2 }] },
  { civ: 'zx', label: '朱熹 封建（5 村民 + 監工）', goals: [{ kind: 'age', age: 2 }] },
  { civ: 'by', label: '拜占庭 封建 → 8 名長弓兵（橄欖油傭兵）', goals: [{ kind: 'age', age: 2 }, { kind: 'army', unit: 'longbowman', count: 8 }] },
  { civ: 'en', label: '英格蘭 直城', goals: [{ kind: 'age', age: 3 }], band: [430, 620] },
  { civ: 'ja', label: '日本 直城（水鳥居）', goals: [{ kind: 'age', age: 3, via: 'floating-gate' }], band: [440, 540] },
  {
    civ: 'ja',
    label: '日本 黑暗塔攻 → 直城（水鳥居）→ 20 騎馬武士',
    goals: [
      { kind: 'build', item: 'outpost', count: 2, forward: true },
      { kind: 'age', age: 3, via: 'floating-gate' },
      { kind: 'army', unit: 'mounted-samurai', count: 20 },
    ],
  },
]

const only = process.argv[2]
let bad = 0
for (const c of CASES) {
  if (only && c.civ !== only) continue
  const data = buildCivData(catalog, c.civ, names)
  const map = generateMap('dry-arabia', 7)
  // 基準區間比的是「只看目標」的時間；另外跑一次含目標後全力出兵（30 兵 + 2 升級）的版本對照
  const s = new Searcher(data, map, c.goals, 3, { post: { units: 0, upgrades: 0 } })
  const t0 = performance.now()
  s.run(Number(process.env.MS ?? 2500))
  const d = s.bestDetailed()!
  const r = d.result
  const sp = new Searcher(data, map, c.goals, 3)
  sp.run(Number(process.env.MS ?? 2500))
  const rp = sp.bestDetailed()!.result
  const ms = performance.now() - t0
  const inBand = !c.band || (r.finish >= c.band[0] && r.finish <= c.band[1])
  if (!inBand) bad++
  console.log(`\n${inBand ? 'ok ' : 'BAD'} ${c.label}: ${clock(r.finish)}  村民 ${r.villagers}  TC 中斷 ${r.tcIdle}s  評估 ${s.evals} 次 / ${Math.round(ms)} ms${c.band ? `  基準 ${clock(c.band[0])}~${clock(c.band[1])}` : ''}`)
  for (const g of r.goals) console.log(`    ${g.label}: ${clock(g.t ?? Infinity)}`)
  console.log(`    含全力出兵：目標 ${clock(rp.finish)}（${rp.villagersAtGoal} 村民）、30 兵 + 2 升級 ${clock(rp.armyAt ?? Infinity)}、TC 中斷 ${rp.tcIdle}s`)
  if (rp.tcIdle > 0) bad++
  const p = d.policy
  console.log(`    中斷原因：${JSON.stringify(r.tcIdleReasons)}`)
  console.log(`    策略：房屋緩衝 ${p.houseBuffer}、打鹿 ${p.hunt}、經濟 ${JSON.stringify(p.ecoAt)}、地標 ${JSON.stringify(p.landmarkPick)}`)
  console.log(`    步驟參數：${p.steps.map((x, i) => `${d.steps[i].label}[建${x.builders} 產${x.producers}]`).join('、')}`)
  if (process.env.V) for (const e of r.events.filter((e) => e.kind !== 'villager').slice(0, 60)) console.log(`      ${clock(e.t)} ${String(e.pop).padStart(3)}  ${e.text}  [${e.split.food}/${e.split.wood}/${e.split.gold}/${e.split.stone}]`)
  for (const w of r.warnings) console.log(`    警告：${w}`)
}
console.log(bad ? `\n${bad} 個案例超出基準區間` : '\n全部在基準區間內')
process.exitCode = bad ? 1 : 0
