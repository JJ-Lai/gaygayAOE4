/**
 * Pull AoE4 World parsed game data and compact it for the tactic simulator.
 * Source: https://github.com/aoe4world/data (tooltips / attrib export).
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rawDir = join(root, 'scripts', 'raw')
const outFile = join(root, 'public', 'sim', 'catalog.json')
const baseUrl = 'https://raw.githubusercontent.com/aoe4world/data/main'

const KEEP_CLASS = new Set([
  'infantry',
  'cavalry',
  'siege',
  'ranged',
  'melee',
  'archer',
  'gunpowder',
  'ship',
  'transport',
  'villager',
  'worker',
  'religious',
  'camel',
  'elephant',
])

const EFFECT_PROPS = new Set([
  'foodGatherRate',
  'woodGatherRate',
  'goldGatherRate',
  'stoneGatherRate',
  'huntGatherRate',
  'berryGatherRate',
  'carryCapacity',
  'moveSpeed',
  'buildTime',
])

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function download(url, dest) {
  if (await exists(dest)) return
  const res = await fetch(url, { headers: { 'user-agent': 'aoe4-tactic-sim' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
}

async function pool(items, limit, fn) {
  const queue = [...items]
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      const item = queue.shift()
      await fn(item)
    }
  })
  await Promise.all(workers)
}

function round(n) {
  return Math.round(n * 1000) / 1000
}

function dpsOf(weapons) {
  if (!Array.isArray(weapons)) return 0
  const weapon = weapons.find((w) => w && (w.type === 'melee' || w.type === 'ranged' || w.type === 'siege'))
  if (!weapon || !weapon.speed) return 0
  return round(weapon.damage / weapon.speed)
}

function tagsOf(classes, id, age) {
  const c = new Set(classes || [])
  const tags = []
  const landmark =
    [...c].some((x) => x.startsWith('age1_landmark'))
    || [...c].some((x) => x.startsWith('age2_landmark'))
    || [...c].some((x) => x.startsWith('age3_landmark'))
  if ([...c].some((x) => x.startsWith('age1_landmark'))) tags.push('toAge2')
  if ([...c].some((x) => x.startsWith('age2_landmark'))) tags.push('toAge3')
  if ([...c].some((x) => x.startsWith('age3_landmark'))) tags.push('toAge4')
  if (c.has('age_up_upgrade') && age >= 1 && age <= 3) tags.push(`toAge${age + 1}`)
  if (c.has('scar_house') && !landmark) tags.push('house')
  if (c.has('town_center') || c.has('town_center_capital')) tags.push('tc')
  if (c.has('farm') || id === 'farm') tags.push('farm')
  if (c.has('resource_drop_off')) tags.push('dropoff')
  if (c.has('military_production_building')) tags.push('production')
  if (id === 'villager' || c.has('villager')) tags.push('villager')
  if ([...c].some((x) => x.startsWith('naval') || x === 'ship')) tags.push('naval')
  return tags
}

function clsOf(classes) {
  return (classes || []).filter((c) => KEEP_CLASS.has(c))
}

function effectsOf(effects) {
  if (!Array.isArray(effects)) return undefined
  const kept = []
  for (const effect of effects) {
    if (!effect || effect.type !== 'passive') continue
    if (!EFFECT_PROPS.has(effect.property)) continue
    if (effect.effect !== 'multiply' && effect.effect !== 'change') continue
    kept.push({
      property: effect.property,
      effect: effect.effect,
      value: effect.value,
      ids: effect.select?.id || undefined,
      classes: effect.select?.class || undefined,
    })
  }
  return kept.length ? kept : undefined
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null)
}

function unionClasses(...lists) {
  const out = []
  for (const list of lists) {
    for (const name of list || []) {
      if (!out.includes(name)) out.push(name)
    }
  }
  return out
}

/** 食物、木材、黃金、石頭以外的花費（拜占庭橄欖油、馬其頓白銀、鄂圖曼維齊爾點數、蘇格蘭集結次數） */
const OTHER_COST = { oliveoil: 'oliveoil', silver: 'silver', vizier: 'vizier', muster_charge: 'muster' }
function otherOf(costs) {
  const out = {}
  for (const [raw, key] of Object.entries(OTHER_COST)) if (costs?.[raw]) out[key] = costs[raw]
  return Object.keys(out).length ? out : undefined
}

function compactItem(entry, kind) {
  const variations = (entry.variations || []).map((v) => {
    const shared = entry.shared?.[v.id] || {}
    const costs = firstDefined(v.costs, shared.costs, entry.costs) || {}
    const classes = unionClasses(v.classes, shared.classes, entry.classes)
    const age = firstDefined(v.age, shared.age, entry.age, entry.minAge, 1)
    const producedBy = firstDefined(v.producedBy, shared.producedBy, entry.producedBy) || []
    const movement = firstDefined(v.movement, shared.movement, entry.movement)
    const weapons = firstDefined(v.weapons, shared.weapons, entry.weapons)
    const hitpoints = firstDefined(v.hitpoints, shared.hitpoints, entry.hitpoints) || 0
    const row = {
      id: v.id,
      age,
      food: costs.food || 0,
      wood: costs.wood || 0,
      gold: costs.gold || 0,
      stone: costs.stone || 0,
      time: costs.time || 0,
      pop: costs.popcap || 0,
      producedBy,
      tags: tagsOf(classes, entry.id, age),
      cls: clsOf(classes),
    }
    const other = otherOf(costs)
    if (other) row.other = other
    if (kind === 'unit') {
      row.hp = hitpoints
      row.speed = movement?.speed || 0
      row.dps = dpsOf(weapons)
    } else if (kind === 'building') {
      row.hp = hitpoints
    }
    const effects = effectsOf(firstDefined(v.effects, shared.effects, entry.effects))
    if (effects) row.effects = effects
    return row
  })
  if (!variations.length) return null
  const allClasses = unionClasses(entry.classes, ...(entry.variations || []).map((v) => v.classes))
  // 商人、官員、使者、非戰鬥的宗教單位不算軍隊（「N 名軍隊」與全力出兵不該挑它們）
  const support =
    ['trade_cart', 'official', 'emissary'].some((c) => allClasses.includes(c))
    || (allClasses.includes('monk') && !allClasses.includes('combat_monk') && !allClasses.includes('infantry'))
  const military = kind === 'unit'
    && !support
    && !variations.some((v) => v.tags.includes('villager') || v.tags.includes('naval'))
    && variations.some((v) => v.pop > 0 && v.producedBy.length > 0)
  const venues = (entry.productionVariations || []).map((venue) => ({
    building: venue.venue,
    food: venue.costs?.food || 0,
    wood: venue.costs?.wood || 0,
    gold: venue.costs?.gold || 0,
    stone: venue.costs?.stone || 0,
    time: venue.costs?.time || 0,
    pop: venue.costs?.popcap || 0,
    ...(otherOf(venue.costs) ? { other: otherOf(venue.costs) } : {}),
  }))
  return {
    id: entry.id,
    name: entry.name,
    kind,
    minAge: entry.minAge || variations[0].age || 1,
    unique: Boolean(entry.unique),
    military,
    variations,
    ...(venues.length ? { venues } : {}),
  }
}

function loadItems(json, kind) {
  return (json.data || []).map((entry) => compactItem(entry, kind)).filter(Boolean)
}

const index = JSON.parse(await readFile(join(rawDir, 'civ-civs-index.json'), 'utf8'))
// patch-history.json 只記錄刪除／改名，沒有 17.0 的鍵。資料本身已是 17.0.x（2026-10-27 的 corrections），
// 所以用 PATCH 環境變數覆蓋，預設是官方 17.0.12260。
const patch = process.env.PATCH || '17.0.12260'
const civs = Object.values(index)

await mkdir(rawDir, { recursive: true })
const jobs = []
for (const civ of civs) {
  for (const kind of ['units', 'buildings', 'technologies', 'upgrades']) {
    const dest = join(rawDir, `${kind}-${civ.slug}.json`)
    const url = `${baseUrl}/${kind}/${civ.slug}-optimized.json`
    jobs.push({ dest, url, slug: civ.slug, kind })
  }
}

process.stdout.write(`downloading ${jobs.length} files...\n`)
await pool(jobs, 8, async (job) => {
  await download(job.url, job.dest)
  process.stdout.write(`  ${job.kind}/${job.slug}\n`)
})

const items = {}
for (const civ of civs) {
  const merged = []
  for (const kind of ['units', 'buildings', 'technologies', 'upgrades']) {
    const json = JSON.parse(await readFile(join(rawDir, `${kind}-${civ.slug}.json`), 'utf8'))
    const kindName = kind === 'units' ? 'unit' : kind === 'buildings' ? 'building' : kind === 'technologies' ? 'technology' : 'upgrade'
    merged.push(...loadItems(json, kindName))
  }
  items[civ.abbr] = merged
}

// ---------- 修正 aoe4world 匯出的已知錯誤（2026-11 各文明研究交叉查證） ----------
const MILL_ECO = ['wheelbarrow', 'survival-techniques', 'horticulture', 'fertilization', 'precision-cross-breeding']
/** abbr -> id -> { add, remove, set（生產建築）, minAge, effects（整組取代）, untrainable } */
const FIX = {
  // 拜占庭、馬其頓：磨坊經濟科技被匯出成只有大酒莊能研究
  by: Object.fromEntries(MILL_ECO.map((id) => [id, { add: ['mill'] }])),
  mac: Object.fromEntries(MILL_ECO.map((id) => [id, { add: ['mill'] }])),
  // 日本：採礦科技也能在鍛造場研究；竹細工、札差的移動速度應為 +7%（匯出成 ×0.9）；俵沒有效果
  ja: {
    'specialized-pick': { add: ['forge'] },
    'shaft-mining': { add: ['forge'] },
    cupellation: { add: ['forge'] },
  },
  // 金帳：怯薛在馬廄、哈剌沙在黑暗時代兵營
  gol: {
    keshik: { set: ['stable'] },
    kharash: { set: ['barracks'], minAge: 1 },
  },
  // 阿拔斯：智慧宮黑暗時代就能蓋
  ab: { 'house-of-wisdom': { minAge: 1 } },
  // 金朝：狩獵、伐木專屬科技的效果是空的
  jin: {
    'mohe-ancestry': { effects: [{ property: 'huntGatherRate', effect: 'multiply', value: 1.2, ids: ['villager', 'mounted-villager'] }] },
    'hunting-tradition': { effects: [{ property: 'huntGatherRate', effect: 'multiply', value: 1.2, ids: ['villager', 'mounted-villager'] }] },
    'draft-horses': { effects: [{ property: 'woodGatherRate', effect: 'multiply', value: 1.15, ids: ['villager', 'mounted-villager'] }] },
  },
  // 斯科訥弩兵的黑暗時代變體是地標免費生成的，一般在城堡時代靶場訓練
  vik: { berserker: { remove: ['sacred-grove', 'gullinn-temple'] }, 'sk-ne-crossbowmen': { dropBefore: 3 } },
  // 城堡→帝王地標漏了 age3_landmark 類別
  ch: { 'great-wall-gatehouse': { tags: ['toAge4'] } },
}
FIX.jin['pagoda-forest'] = { tags: ['toAge4'] }
const TAWARA = (n) => [
  { property: 'carryCapacity', effect: 'change', value: 3, ids: ['villager'] },
  { property: 'moveSpeed', effect: 'multiply', value: 1.07, ids: ['villager'] },
  { property: 'berryGatherRate', effect: 'multiply', value: 1.25, ids: ['villager'] },
].slice(0, n)
for (const abbr of ['ja', 'sen']) {
  FIX[abbr] = { ...(FIX[abbr] || {}), tawara: { effects: TAWARA(3) }, takezaiku: { effects: TAWARA(3) }, fudasashi: { effects: TAWARA(3) } }
}
/** 地標或特殊建築被匯出成一般生產建築：從所有單位的生產者拿掉（拿掉後沒有生產者就保留） */
const NOT_PRODUCER = {
  by: ['golden-horn-tower', 'palatine-school', 'trade-post'],
  ot: ['military-school', 'mehmed-imperial-armory'],
  mac: ['golden-horn-tower', 'varangian-warcamp'],
}
// 0 秒變體但其實能一般訓練（civSpec.costOverride 補上正確時間）
const UNTRAINABLE_OK = new Set(['*:worker-elephant', 'jin:horseman', 'jin:iron-pagoda', 'jin:mohe-tribesman', 'jin:scout'])

function applyFixes(abbr, list) {
  const fix = FIX[abbr] || {}
  const drop = NOT_PRODUCER[abbr] || []
  for (const item of list) {
    const f = fix[item.id]
    for (const v of item.variations) {
      if (item.kind === 'unit' && drop.length) {
        const kept = v.producedBy.filter((p) => !drop.includes(p))
        if (kept.length) v.producedBy = kept
      }
      // 0 秒的單位變體是草場馬、徵召兵這類「技能產生」的版本，不能一般訓練
      if (item.kind === 'unit' && v.time === 0 && !UNTRAINABLE_OK.has(`*:${item.id}`) && !UNTRAINABLE_OK.has(`${abbr}:${item.id}`) && v.producedBy.length) v.producedBy = []
      if (!f) continue
      if (f.set) v.producedBy = [...f.set]
      if (f.add) v.producedBy = [...new Set([...v.producedBy, ...f.add])]
      if (f.remove) v.producedBy = v.producedBy.filter((p) => !f.remove.includes(p))
      if (f.effects) v.effects = f.effects.map((e) => ({ ...e }))
      if (f.tags) v.tags = [...new Set([...v.tags, ...f.tags])]
    }
    if (f?.dropBefore != null) {
      item.variations = item.variations.filter((v) => v.age >= f.dropBefore)
      item.minAge = Math.min(...item.variations.map((v) => v.age))
    }
    // 拿掉生產者的 0 秒變體：同一單位還有其他可訓練的變體時直接刪掉，最早時代才會正確（伯爵衛隊是城堡時代）
    if (item.kind === 'unit' && item.variations.some((v) => v.producedBy.length) && item.variations.some((v) => !v.producedBy.length)) {
      item.variations = item.variations.filter((v) => v.producedBy.length)
      item.minAge = Math.min(...item.variations.map((v) => v.age))
    }
    if (f?.minAge != null) {
      const first = Math.min(...item.variations.map((v) => v.age))
      for (const v of item.variations) if (v.age === first) v.age = f.minAge
      item.minAge = f.minAge
    }
    if (item.kind === 'unit' && item.military && !item.variations.some((v) => v.producedBy.length)) item.military = false
  }
  return list
}
for (const civ of civs) applyFixes(civ.abbr, items[civ.abbr])

const catalog = {
  source: 'https://github.com/aoe4world/data',
  sourceHost: 'https://data.aoe4world.com/',
  patch,
  generatedFrom: 'main',
  civilizations: civs.map((c) => ({
    abbr: c.abbr,
    id: c.id,
    name: c.name,
    slug: c.slug,
    expansion: c.expansion || [],
  })),
  gather: {
    carry: 10,
    note: 'Node gather rates are the in-game base rates (resource per second while gathering). Unit costs, train times, build times, and move speeds come from the AoE4 World attrib export. Technology effects multiply those rates.',
    sources: [
      { id: 'sheep', resource: 'food', rate: 0.75, finite: true, label: '羊' },
      { id: 'farm', resource: 'food', rate: 0.75, finite: false, label: '農田' },
      { id: 'berry', resource: 'food', rate: 0.69, finite: true, label: '野果' },
      { id: 'deer', resource: 'food', rate: 0.825, finite: true, label: '鹿' },
      { id: 'boar', resource: 'food', rate: 0.9, finite: true, label: '野豬' },
      { id: 'wood', resource: 'wood', rate: 0.75, finite: false, label: '木材' },
      { id: 'gold', resource: 'gold', rate: 0.75, finite: false, label: '黃金' },
      { id: 'stone', resource: 'stone', rate: 0.75, finite: false, label: '石頭' },
    ],
    civRates: {
      hl: { sheep: 0.9 },
      kt: { wood: 0.6 },
      ab: { berry: 0.8625 },
      ay: { berry: 0.8625 },
      de: { berry: 0.8625 },
    },
  },
  items,
}

await mkdir(dirname(outFile), { recursive: true })
await writeFile(outFile, JSON.stringify(catalog))

const counts = civs.map((c) => {
  const list = items[c.abbr]
  const by = {}
  for (const item of list) by[item.kind] = (by[item.kind] || 0) + 1
  return `${c.abbr}\t${list.length}\t${JSON.stringify(by)}`
})
process.stdout.write(`patch ${patch}\n${counts.join('\n')}\n`)
process.stdout.write(`wrote ${outFile}\n`)
