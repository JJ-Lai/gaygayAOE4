// 用本機的對局統計檔實測地圖距離：node scripts/measure-map-distances.mjs
// 讀遊戲 network 資料夾與 data/relic-cache 的 M_<id>_<hash>.gz（解壓後是 Relic Chunky 統計檔），
// 每場 1v1、每位玩家量：首都城鎮中心到第一座採礦營地、伐木場、磨坊（遊戲開始 7 分鐘內），以及到對手首都的距離。
// 座標單位：1 格 = 4 單位（Fandom：1 tile = 4 meters；統計檔裡相鄰 2×2 農田的中心距離 8 單位，吻合）。
// 地圖名稱從 dashboard/data/aoe4-data.json 依場次 id 對應。結果寫到 scripts/map-distances.json。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const require = createRequire(import.meta.url)
const { parseStatsBuffer } = require(path.join(root, 'lib/stats-parse.js'))

const UNIT = 4
const home = process.env.USERPROFILE || ''
const gameDirs = [
  path.join(home, 'OneDrive', '文件', 'My Games', 'Age of Empires IV', 'network'),
  path.join(home, 'OneDrive', 'Documents', 'My Games', 'Age of Empires IV', 'network'),
  path.join(home, 'Documents', 'My Games', 'Age of Empires IV', 'network'),
  path.join(root, 'data', 'relic-cache'),
]
const data = JSON.parse(fs.readFileSync(path.join(root, 'dashboard/data/aoe4-data.json'), 'utf8'))
const mapOf = new Map(data.matches.map((m) => [String(m.id), m.map]))

const KINDS = {
  mining: /^building_econ_mining_camp/,
  wood: /^building_econ_wood/,
  mill: /^building_econ_food/,
}
const LIMIT = 420
const out = {}
const seen = new Set()
let files = 0
let used = 0
for (const dir of gameDirs) {
  if (!fs.existsSync(dir)) continue
  for (const name of fs.readdirSync(dir)) {
    const m = /^M_(\d+)_[0-9a-fA-F]+\.gz$/.exec(name)
    if (!m || seen.has(m[1])) continue
    seen.add(m[1])
    files++
    let buf
    try {
      buf = zlib.gunzipSync(fs.readFileSync(path.join(dir, name)))
    } catch {
      continue
    }
    if (buf.subarray(0, 12).toString('latin1') !== 'Relic Chunky') continue
    let res
    try {
      res = parseStatsBuffer(buf)
    } catch {
      continue
    }
    const created = res.stls?.created ?? []
    const caps = created.filter((e) => e.t === 0 && /^building_town_center_capital/.test(e.type))
    if (caps.length !== 2) continue
    const map = mapOf.get(m[1]) ?? '（未知）'
    const rec = (out[map] ??= { matches: 0, enemy: [], mining: [], mining2: [], wood: [], mill: [] })
    rec.matches++
    used++
    rec.enemy.push(Math.hypot(caps[0].x - caps[1].x, caps[0].y - caps[1].y) / UNIT)
    for (const tc of caps) {
      for (const [k, re] of Object.entries(KINDS)) {
        const first = created.find((e) => e.player === tc.player && e.t > 0 && e.t <= LIMIT && re.test(e.type))
        if (first) rec[k].push(Math.hypot(first.x - tc.x, first.y - tc.y) / UNIT)
      }
      // 第二座採礦營地：離第一座 6 格以上（另一個礦），開局 10 分鐘內
      const camps = created.filter((e) => e.player === tc.player && e.t > 0 && e.t <= 600 && KINDS.mining.test(e.type))
      const second = camps.find((e) => Math.hypot(e.x - camps[0].x, e.y - camps[0].y) / UNIT >= 6)
      if (second) rec.mining2.push(Math.hypot(second.x - tc.x, second.y - tc.y) / UNIT)
    }
  }
}
const q = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b)
  if (!s.length) return null
  const i = (s.length - 1) * p
  const lo = Math.floor(i)
  return Math.round((s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)) * 10) / 10
}
const summary = {}
// 全部地圖合計（樣本少的地圖用這個）
const all = { matches: used, enemy: [], mining: [], mining2: [], wood: [], mill: [] }
for (const r of Object.values(out)) for (const k of ['enemy', 'mining', 'mining2', 'wood', 'mill']) all[k].push(...r[k])
out['（全部）'] = all
for (const [map, r] of Object.entries(out).sort((a, b) => b[1].matches - a[1].matches)) {
  summary[map] = { matches: r.matches }
  for (const k of ['enemy', 'mining', 'mining2', 'wood', 'mill']) summary[map][k] = { n: r[k].length, q1: q(r[k], 0.25), median: q(r[k], 0.5), q3: q(r[k], 0.75) }
}
const file = path.join(here, 'map-distances.json')
fs.writeFileSync(file, JSON.stringify({ generated: new Date().toISOString(), unit: '格（1 格 = 4 座標單位）', note: '每場 1v1、每位玩家：首都城鎮中心到開局 7 分鐘內第一座採礦營地／伐木場／磨坊、10 分鐘內第二座採礦營地（離第一座 6 格以上），與兩座首都的距離', files, matches: used, maps: summary }, null, 1))
console.log(`讀了 ${files} 個檔、${used} 場 1v1`)
for (const [map, s] of Object.entries(summary).slice(0, 12)) console.log(map, s.matches, '對手', s.enemy.median, '礦', `${s.mining.q1}~${s.mining.q3}`, '第二礦', `${s.mining2.q1}~${s.mining2.q3}`, '木', `${s.wood.q1}~${s.wood.q3}`, '磨坊', `${s.mill.q1}~${s.mill.q3}`)
