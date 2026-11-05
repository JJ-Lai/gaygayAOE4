// 從 AoE4 World 的對局摘要統計各文明的實際開局：0 秒時的資源、單位、動物與建築。
// 只取標準模式（rm／qm 的 NvN，不含帝國戰爭、遊牧等特殊開局），每個文明取 PER_CIV 場。
// 用法：node scripts/fetch-start-conditions.mjs [每文明場數，預設 4]
// 輸出：scripts/start-conditions.json（每場原始樣本 + 每文明的眾數彙整）
import { writeFileSync, existsSync, readFileSync } from 'node:fs'

const OUT = new URL('./start-conditions.json', import.meta.url)
const PER_CIV = Number(process.argv[2] ?? 4)
const MAX_PAGES = 30
const UA = { 'User-Agent': 'aoe4-planner-calibration/1.0 (personal match dashboard)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const STANDARD = /^(rm|qm)_\dv\d$/

async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: UA })
    if (r.status === 429) { await sleep(5000); continue }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`)
    return r.json()
  }
  throw new Error('HTTP 429 ' + url)
}

// 圖示路徑的最後一段當名稱：icons/races/common/units/scout → scout
const iconName = (icon) => String(icon || '').split('/').pop().replace(/\.(png|webp)$/, '')

function startOf(player) {
  const r = player.resources || {}
  const at0 = (k) => (Array.isArray(r[k]) && r.timestamps?.[0] === 0 ? r[k][0] : null)
  const resources = {}
  for (const k of Object.keys(r)) {
    if (k === 'timestamps' || /PerMin|Gathered$|^(total|military|economy|technology|society)$/.test(k)) continue
    const v = at0(k)
    if (v != null) resources[k] = v
  }
  const entities = {}
  for (const b of player.buildOrder || []) {
    // 有些開局單位不在 finished，而是記在 unknown 的事件代碼裡（例如朱熹的開局監工是代碼 14、0 秒）
    // 只在 finished／constructed 沒有 0 秒紀錄時才用 unknown，避免同一個單位算兩次
    const known = [...(b.finished || []), ...(b.constructed || [])].filter((t) => t <= 0).length
    const n = known || Object.values(b.unknown || {}).flat().filter((t) => t <= 0).length
    if (!n) continue
    const key = `${b.type}:${iconName(b.icon)}`
    entities[key] = (entities[key] || 0) + n
  }
  return { resources, entities }
}

const mode = (list) => {
  const c = new Map()
  for (const x of list) { const k = JSON.stringify(x); c.set(k, (c.get(k) || 0) + 1) }
  let best = null, n = 0
  for (const [k, v] of c) if (v > n) { best = k; n = v }
  return { value: best && JSON.parse(best), agree: n, of: list.length }
}

// 需要的文明：規劃器目錄裡的全部文明（aoe4world id）
const CATALOG = JSON.parse(readFileSync(new URL('../public/sim/catalog.json', import.meta.url), 'utf8'))
const civs = new Set(CATALOG.civilizations.map((c) => c.id))

// 對局來源：先翻全站最新對局（只到第 19 頁左右），翻完改翻天梯玩家各自的最近對局
async function* gameSources() {
  for (let page = 1; page <= MAX_PAGES; page++) {
    let doc
    try { doc = await getJson(`https://aoe4world.com/api/v0/games?page=${page}`) } catch (e) { console.error('全站對局翻到第 ' + page + ' 頁為止：' + e.message); break }
    await sleep(800)
    yield doc.games || []
  }
  for (const board of ['rm_solo', 'rm_team', 'qm_1v1', 'qm_2v2']) {
    for (let page = 1; page <= 10; page++) {
      let lb
      try { lb = await getJson(`https://aoe4world.com/api/v0/leaderboards/${board}?page=${page}`) } catch { break }
      await sleep(800)
      for (const p of lb.players || []) {
        let g
        try { g = await getJson(`https://aoe4world.com/api/v0/players/${p.profile_id}/games?limit=50`) } catch { continue }
        await sleep(800)
        yield g.games || []
      }
    }
  }
}

// 只用最新 patch：全站最新對局第一頁裡最大的 patch
const first = await getJson('https://aoe4world.com/api/v0/games?page=1')
const patch = Math.max(...(first.games || []).map((g) => Number(g.patch) || 0))

// 接續上次的結果（同一個 patch 才沿用），每多一筆就存檔，中途出錯也不會白跑
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null
const samples = prev && prev.patch === patch ? prev.samples.filter((s) => Number(s.patch) === patch) : []
const perCiv = new Map()
for (const s of samples) perCiv.set(s.civ, (perCiv.get(s.civ) || 0) + 1)
const seenGames = new Set(samples.map((s) => s.game))
const need = () => [...civs].filter((c) => (perCiv.get(c) || 0) < PER_CIV)

function save() {
  const summary = {}
  for (const civ of [...new Set(samples.map((x) => x.civ))].sort()) {
    const list = samples.filter((x) => x.civ === civ)
    summary[civ] = { resources: mode(list.map((x) => x.resources)), entities: mode(list.map((x) => x.entities)) }
  }
  const short = need().map((c) => `${c} ${perCiv.get(c) || 0}`)
  writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), patch, source: 'aoe4world.com game summaries', perCiv: PER_CIV, short, summary, samples }, null, 1) + '\n')
  return { patch, civs: Object.keys(summary).length, samples: samples.length, short }
}

outer: for await (const games of gameSources()) {
  for (const g of games) {
    if (!need().length) break outer
    if (Number(g.patch) !== patch || !STANDARD.test(g.kind) || seenGames.has(g.game_id)) continue
    const players = g.teams.flat().map((t) => t.player)
    const want = players.filter((p) => civs.has(p.civilization) && (perCiv.get(p.civilization) || 0) < PER_CIV)
    if (!want.length) continue
    seenGames.add(g.game_id)
    let s
    try { s = await getJson(`https://aoe4world.com/players/${want[0].profile_id}/games/${g.game_id}/summary?camelize=true`) } catch { await sleep(1100); continue }
    await sleep(1100)
    let added = false
    for (const sp of s.players || []) {
      if ((perCiv.get(sp.civilization) || 0) >= PER_CIV) continue
      const st = startOf(sp)
      if (!Object.keys(st.resources).length) continue
      perCiv.set(sp.civilization, (perCiv.get(sp.civilization) || 0) + 1)
      samples.push({ civ: sp.civilization, game: g.game_id, patch: Number(g.patch), kind: g.kind, map: g.map, startedAt: g.started_at, ...st })
      console.error(`${sp.civilization} ${perCiv.get(sp.civilization)}/${PER_CIV}`)
      added = true
    }
    if (added) save()
  }
}

console.log(JSON.stringify(save()))
