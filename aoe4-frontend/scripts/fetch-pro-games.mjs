// 收集職業（天梯前段）1v1 排位對局的操作紀錄，給 check-pro-replay.ts 驗證模擬器。
// 用法：node scripts/fetch-pro-games.mjs [每文明場數，預設 5] [最低評分，預設 1700]
// 來源：AoE4 World 天梯 rm_solo 前段玩家的最近對局 → 單場摘要（有些對局沒有摘要，回 404 就跳過）。
// 只收最新 patch 的 rm_1v1；每場只收評分達門檻的玩家那一方。每筆存檔，中斷可接續。
// 輸出：scripts/pro-games.json（每筆：文明、評分、地圖、升代時間、村民出生時間、建築、單位、科技，都到城堡時代或 15 分鐘為止）
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const OUT = new URL('./pro-games.json', import.meta.url)
const PER_CIV = Number(process.argv[2] ?? 5)
const MIN_RATING = Number(process.argv[3] ?? 1700)
const UA = { 'User-Agent': 'aoe4-planner-calibration/1.0 (personal match dashboard)' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** 只記到城堡時代完成或 15 分鐘（取較晚的升城堡時間，沒升就 15 分鐘） */
const HORIZON = 15 * 60

async function getJson(url) {
  for (let i = 0; i < 4; i++) {
    let r
    try {
      r = await fetch(url, { headers: UA })
    } catch {
      // 連線被重設等網路錯誤：等一下再試
      await sleep(5000)
      continue
    }
    if (r.status === 429) {
      await sleep(8000)
      continue
    }
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`)
    return r.json()
  }
  throw new Error('HTTP 429 ' + url)
}

// pbgid → [目錄 id, 種類 u/b/t, …]（儀表板的成本表，來源 data.aoe4world.com）
const DASH = JSON.parse(readFileSync(new URL('../../dashboard/catalog.json', import.meta.url), 'utf8')).items
const CATALOG = JSON.parse(readFileSync(new URL('../public/sim/catalog.json', import.meta.url), 'utf8'))
const civs = new Set(CATALOG.civilizations.map((c) => c.id))

function extract(sp, horizon) {
  const villagers = []
  const buildings = []
  const units = []
  const techs = []
  const unknown = []
  for (const b of sp.buildOrder || []) {
    const d = DASH[b.pbgid]
    const times = (k) => (b[k] || []).filter((t) => typeof t === 'number' && t > 0 && t <= horizon)
    if (!d) {
      const n = times('finished').length + times('constructed').length
      if (n && b.type !== 'Animal' && b.type !== 'Age') unknown.push(`${b.type}:${String(b.icon).split('/').pop()}`)
      continue
    }
    const [id, kind] = d
    if (kind === 'u') {
      for (const t of times('finished')) (/villager$/.test(id) ? villagers : units).push([Math.round(t), id])
    } else if (kind === 'b') {
      for (const t of times('constructed')) buildings.push([Math.round(t), id])
    } else {
      for (const t of times('finished')) techs.push([Math.round(t), id])
    }
  }
  const by = (a, b) => a[0] - b[0]
  return { villagers: villagers.sort(by), buildings: buildings.sort(by), units: units.sort(by), techs: techs.sort(by), unknown: [...new Set(unknown)], gathered: gatheredOf(sp, horizon) }
}

/**
 * 累計收入（摘要每 20 秒一筆），到 horizon 為止。摘要的 *Gathered 其實是累計花費（見 dashboard/資料格式.md），
 * 所以累計收入 = 累計花費 + 目前庫存 − 開局庫存（含被動收入與一次給的資源）。
 */
function gatheredOf(sp, horizon) {
  const r = sp.resources || {}
  const ts = r.timestamps || []
  const n = ts.filter((t) => t <= horizon + 20).length
  const col = (k) => {
    const spent = r[k + 'Gathered']
    const stock = r[k]
    if (!Array.isArray(spent) || !Array.isArray(stock)) return null
    return spent.slice(0, n).map((x, i) => Math.round(x + (stock[i] ?? 0) - (stock[0] ?? 0)))
  }
  return { t: ts.slice(0, n), food: col('food'), wood: col('wood'), gold: col('gold'), stone: col('stone'), income: true }
}

const first = await getJson('https://aoe4world.com/api/v0/games?page=1')
const patch = Math.max(...(first.games || []).map((g) => Number(g.patch) || 0))
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null
const samples = prev && prev.patch === patch ? prev.samples : []
const tried = new Set(prev && prev.patch === patch ? prev.tried ?? [] : [])
const perCiv = new Map()
for (const s of samples) perCiv.set(s.civ, (perCiv.get(s.civ) || 0) + 1)
const need = () => [...civs].filter((c) => (perCiv.get(c) || 0) < PER_CIV)
const save = () =>
  writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), patch, minRating: MIN_RATING, perCiv: PER_CIV, short: need().map((c) => `${c} ${perCiv.get(c) || 0}`), tried: [...tried], samples }, null, 1) + '\n')

// 舊樣本沒有累計採集：重抓摘要補上
for (const smp of samples) {
  if (smp.gathered?.income) continue
  const s = await getJson(`https://aoe4world.com/players/${smp.profileId}/games/${smp.game}/summary?camelize=true`)
  await sleep(1200)
  const sp = s?.players?.find((x) => x.profileId === smp.profileId)
  if (sp) smp.gathered = gatheredOf(sp, smp.horizon)
  save()
}

outer: for (let page = 1; page <= 40; page++) {
  const lb = await getJson(`https://aoe4world.com/api/v0/leaderboards/rm_solo?page=${page}`)
  await sleep(900)
  if (!lb?.players?.length) break
  if (lb.players.every((p) => p.rating < MIN_RATING)) break
  for (const p of lb.players) {
    if (p.rating < MIN_RATING) continue
    const g = await getJson(`https://aoe4world.com/api/v0/players/${p.profile_id}/games?limit=50&leaderboard=rm_solo`)
    await sleep(900)
    for (const game of g?.games ?? []) {
      if (!need().length) break outer
      if (Number(game.patch) !== patch || game.kind !== 'rm_1v1' || game.duration < 360 || tried.has(game.game_id)) continue
      const players = game.teams.flat().map((x) => x.player)
      const want = players.filter((x) => (x.rating ?? 0) >= MIN_RATING && civs.has(x.civilization) && (perCiv.get(x.civilization) || 0) < PER_CIV)
      if (!want.length) continue
      tried.add(game.game_id)
      const s = await getJson(`https://aoe4world.com/players/${want[0].profile_id}/games/${game.game_id}/summary?camelize=true`)
      await sleep(1200)
      if (!s?.players) continue
      for (const w of want) {
        const sp = s.players.find((x) => x.profileId === w.profile_id)
        if (!sp || (perCiv.get(w.civilization) || 0) >= PER_CIV) continue
        const ages = sp.actions || {}
        const feudal = ages.feudalAge?.[0] ?? null
        const castle = ages.castleAge?.[0] ?? null
        if (feudal == null) continue
        const horizon = Math.max(castle ?? 0, Math.min(HORIZON, game.duration))
        perCiv.set(w.civilization, (perCiv.get(w.civilization) || 0) + 1)
        samples.push({
          civ: w.civilization,
          game: game.game_id,
          profileId: w.profile_id,
          name: sp.name,
          rating: w.rating,
          map: game.map,
          result: sp.result,
          duration: game.duration,
          ages: { 2: feudal, 3: castle, 4: ages.imperialAge?.[0] ?? null },
          horizon,
          ...extract(sp, horizon),
        })
        console.error(`${w.civilization} ${perCiv.get(w.civilization)}/${PER_CIV}（${sp.name} ${w.rating}，封建 ${feudal}${castle ? '、城堡 ' + castle : ''}）`)
      }
      save()
    }
  }
}
save()
console.log(JSON.stringify({ patch, samples: samples.length, short: need().map((c) => `${c} ${perCiv.get(c) || 0}`) }))
