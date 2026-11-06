// 從目錄整理出單一文明要用的資料，並修正目錄已知的標籤問題：
//  - 蒙古地標的 toAgeN 標籤錯位（銀樹標成 toAge3）→ 一律用「變體時代 + 1」。
//  - 聖女貞德的 jeanne-darc-peasant 被標成村民 → 工人只看 civSpec.worker。

import type { Catalog, CatalogItem, Variation } from '../types.ts'
import { civSpec, type CivSpec } from './civSpec.ts'
import type { Bundle, Goal, Step } from './types.ts'

export interface AgeOption {
  id: string
  name: string
  /** building = 村民蓋地標；tech = 在建築裡研究 */
  mode: 'building' | 'tech'
  /** 研究升代科技的建築（任一座即可） */
  producers: string[]
  cost: Bundle
  /** 特殊資源花費 */
  other: Record<string, number> | null
  time: number
}

export interface CivData {
  abbr: string
  spec: CivSpec
  items: Map<string, CatalogItem>
  names: Record<string, string>
  houseId: string | null
  ageOptions: Record<number, AgeOption[]>
  /** 可研究、會影響村民採集的經濟科技 */
  ecoTechs: string[]
}

export const ECO_TECHS = [
  'wheelbarrow',
  'forestry',
  'survival-techniques',
  'double-broadax',
  'horticulture',
  'specialized-pick',
  'lumber-preservation',
  'fertilization',
  'shaft-mining',
  'crosscut-saw',
  'precision-cross-breeding',
  'cupellation',
  'takezaiku',
  'fudasashi',
  // 日本、戰國：俵（黑暗時代）；金朝：狩獵與伐木專屬科技
  'tawara',
  'mohe-ancestry',
  'hunting-tradition',
  'draft-horses',
]

export function costOf(v: Variation): Bundle {
  return { food: v.food, wood: v.wood, gold: v.gold, stone: v.stone }
}

/** 特殊資源花費（橄欖油、白銀、維齊爾點數、集結次數）；沒有時是 null */
export function otherOf(v: Variation): Record<string, number> | null {
  if (!v.other) return null
  const out: Record<string, number> = {}
  for (const [k, x] of Object.entries(v.other)) if (x > 0) out[k] = x
  return Object.keys(out).length ? out : null
}

/** 套用 civSpec 的目錄修正：花費、時間覆蓋與「不是軍隊」標記 */
function patchItem(spec: CivSpec, item: CatalogItem): CatalogItem {
  const fix = spec.costOverride[item.id]
  const notMil = spec.notMilitary.includes(item.id)
  const ageFix = spec.minAgeOverride[item.id]
  if (!fix && !notMil && ageFix == null) return item
  const first = Math.min(...item.variations.map((v) => v.age))
  const variations = item.variations.map((v) => {
    // 時代標錯：把最早的變體改到正確時代
    const base = ageFix != null && v.age === first ? { ...v, age: ageFix } : v
    if (!fix) return base
    const out: Variation = { ...base, other: base.other ? { ...base.other } : undefined }
    for (const [k, x] of Object.entries(fix)) {
      if (x == null) continue
      if (k === 'food' || k === 'wood' || k === 'gold' || k === 'stone' || k === 'time') out[k] = x
      else out.other = { ...(out.other ?? {}), [k]: x }
    }
    return out
  })
  return { ...item, military: notMil ? false : item.military, minAge: ageFix ?? item.minAge, variations }
}

export function minAge(item: CatalogItem) {
  return Math.min(...item.variations.map((v) => v.age))
}

/** 該時代可用的最高變體；還沒開放時回傳最早的變體 */
export function variationAt(item: CatalogItem, age: number): Variation {
  let best: Variation | null = null
  for (const v of item.variations) if (v.age <= age && (!best || v.age > best.age)) best = v
  return best ?? item.variations.reduce((a, b) => (a.age <= b.age ? a : b))
}

export function buildCivData(catalog: Catalog, abbr: string, names: Record<string, string>): CivData {
  const spec = civSpec(abbr)
  const extra: CatalogItem[] = (spec.extraItems ?? []).map((x) => {
    const src = x.effectsFrom ? (catalog.items[x.effectsFrom.civ] ?? []).find((i) => i.id === x.effectsFrom!.id) : undefined
    return {
      id: x.id,
      name: x.name,
      kind: 'technology',
      minAge: x.age,
      unique: true,
      military: false,
      variations: [
        {
          id: `${x.id}-${x.age}`,
          age: x.age,
          food: x.cost.food ?? 0,
          wood: x.cost.wood ?? 0,
          gold: x.cost.gold ?? 0,
          stone: x.cost.stone ?? 0,
          time: x.time,
          pop: 0,
          producedBy: x.producedBy,
          tags: [],
          cls: [],
          effects: src?.variations[0]?.effects,
          other: x.other,
        },
      ],
    }
  })
  // 同 id 的補充項目取代目錄的（鄂圖曼安納托利亞丘陵的目錄效果是錯的）
  const extraIds = new Set(extra.map((x) => x.id))
  const list = [...(catalog.items[abbr] ?? []).filter((i) => !extraIds.has(i.id)), ...extra].map((i) => patchItem(spec, i))
  const items = new Map(list.map((i) => [i.id, i]))
  const houseId = spec.popModel === 'max' ? null : (['house', 'farmhouse', 'longhouse'].find((id) => items.has(id)) ?? null)

  const ageOptions: Record<number, AgeOption[]> = { 2: [], 3: [], 4: [] }
  for (const item of list) {
    for (const v of item.variations) {
      if (!v.tags.some((t) => t.startsWith('toAge'))) continue
      const to = v.age + 1
      if (!ageOptions[to]) continue
      const mode = item.kind === 'building' ? 'building' : 'tech'
      const cost = costOf(v)
      if (mode === 'building') for (const k of ['food', 'wood', 'gold', 'stone'] as const) cost[k] = Math.round(cost[k] * spec.landmarkCostMul)
      ageOptions[to].push({
        id: item.id,
        name: names[item.id] ?? item.name,
        mode,
        producers: mode === 'tech' ? v.producedBy : [],
        cost,
        other: otherOf(v),
        time: v.time,
      })
    }
  }
  const ecoTechs = ECO_TECHS.filter((id) => {
    const it = items.get(id)
    if (!it) return false
    // 只留在有投放點的建築研究的（避免需要額外地標）
    return variationAt(it, 4).producedBy.length > 0
  })
  // 文明專屬經濟科技（新鮮食材、大名宅邸…）：效果寫在 spec.triggers
  for (const ct of spec.civTechs) {
    const it = items.get(ct.id)
    if (it && (ct.instant || variationAt(it, 4).producedBy.length > 0) && !ecoTechs.includes(ct.id)) ecoTechs.push(ct.id)
  }
  return { abbr, spec, items, names, houseId, ageOptions, ecoTechs }
}

export function nameOf(data: CivData, id: string) {
  return data.names[id] ?? data.items.get(id)?.name ?? id
}

/** 目錄標成城鎮中心的建築（含英格蘭王宮、士瓦本宮這類兼城鎮中心的地標） */
export function isTownCenter(data: CivData, id: string) {
  if (id === 'town-center' || id === 'capital-town-center') return true
  const it = data.items.get(id)
  return !!it && it.kind === 'building' && it.variations.some((v) => v.tags.includes('tc'))
}

/** 村民蓋得出來、不是地標的建築 */
export function isBuildable(data: CivData, id: string) {
  const b = data.items.get(id)
  if (!b || b.kind !== 'building') return false
  const bv = variationAt(b, 4)
  if (bv.tags.some((t) => t.startsWith('toAge'))) return false
  return bv.producedBy.includes(data.spec.worker) || bv.producedBy.includes('villager')
}

/**
 * 找生產建築：優先用已擁有或可蓋的「非城鎮中心」建築，
 * 只有別處都做不了時才用城鎮中心（城鎮中心要一直出村民）。
 */
function buildableProducer(data: CivData, unit: CatalogItem, age: number, owned: Set<string>) {
  const v = variationAt(unit, 4)
  const worker = data.spec.worker
  for (const p of v.producedBy) if (owned.has(p) && !isTownCenter(data, p)) return { id: p, needBuild: false }
  for (const p of v.producedBy) {
    if (isTownCenter(data, p)) continue
    const b = data.items.get(p)
    if (!b || b.kind !== 'building') continue
    const bv = variationAt(b, 4)
    if (bv.tags.some((t) => t.startsWith('toAge'))) continue
    if (!bv.producedBy.includes(worker) && !bv.producedBy.includes('villager')) continue
    if (minAge(b) > Math.max(age, minAge(unit))) continue
    return { id: p, needBuild: true }
  }
  for (const p of v.producedBy) if (owned.has(p)) return { id: p, needBuild: false }
  return null
}

export interface Resolved {
  steps: Step[]
  errors: string[]
}

/** 把使用者的目標鏈展開成具體步驟，補上隱含的升代與生產建築。 */
export function resolveGoals(data: CivData, goals: Goal[], landmarkPick: Record<number, string>): Resolved {
  const steps: Step[] = []
  const errors: string[] = []
  let age = 1
  const owned = new Set<string>(['town-center', 'capital-town-center', ...data.spec.prebuilt])
  const name = (id: string) => nameOf(data, id)

  const pushAge = (gi: number, target: number, via: string | undefined, implicit: boolean) => {
    for (let a = age + 1; a <= target; a++) {
      const opts = data.ageOptions[a] ?? []
      const chosen = (a === target && via ? opts.find((o) => o.id === via) : null) ?? opts.find((o) => o.id === landmarkPick[a]) ?? opts[0]
      if (!chosen) {
        errors.push(`找不到升到第 ${a} 時代的方式`)
        return false
      }
      if (chosen.mode === 'tech' && chosen.producers.length && !chosen.producers.some((p) => owned.has(p))) {
        const p = chosen.producers[0]
        const prod = data.items.get(p)
        if (prod && prod.kind === 'building') {
          steps.push({ goalIndex: gi, implicit: true, kind: 'build', item: p, count: 1, forward: false, label: `蓋${name(p)}` })
          owned.add(p)
        }
      }
      steps.push({
        goalIndex: gi,
        implicit: implicit || a !== target,
        kind: 'age',
        item: chosen.id,
        count: 1,
        forward: false,
        age: a,
        label: `${['', '黑暗', '封建', '城堡', '帝王'][a]}時代（${chosen.name}）`,
      })
      if (chosen.mode === 'building') owned.add(chosen.id)
      age = a
    }
    return true
  }

  goals.forEach((g, gi) => {
    if (g.kind === 'age') {
      if (g.age <= age) {
        errors.push(`第 ${gi + 1} 個目標：已經在第 ${g.age} 時代以後`)
        return
      }
      pushAge(gi, g.age, g.via, false)
      return
    }
    if (g.kind === 'villagers') {
      steps.push({ goalIndex: gi, implicit: false, kind: 'villagers', item: data.spec.worker, count: g.count, forward: false, label: `${g.count} 名村民` })
      return
    }
    const id = g.kind === 'build' ? g.item : g.kind === 'army' ? g.unit : g.item
    const item = data.items.get(id)
    if (!item) {
      errors.push(`第 ${gi + 1} 個目標：這個文明沒有 ${id}`)
      return
    }
    const need = minAge(item)
    if (need > age && !pushAge(gi, need, undefined, true)) return
    if (g.kind === 'build') {
      steps.push({ goalIndex: gi, implicit: false, kind: 'build', item: id, count: g.count, forward: !!g.forward, label: `${g.forward ? '前線' : ''}蓋 ${g.count} 座${name(id)}` })
      owned.add(id)
      return
    }
    // army / tech 需要生產建築
    let prod = buildableProducer(data, item, age, owned)
    if (!prod) {
      // 只有地標能生產：升代時改選那座地標（之前的升代沒指定地標時改掉它，還沒升到就補一步）
      const lv = variationAt(item, 4)
      for (const p of lv.producedBy) {
        for (const a of [2, 3, 4]) {
          const opt = (data.ageOptions[a] ?? []).find((o) => o.id === p && o.mode === 'building')
          if (!opt) continue
          if (a > age) {
            if (!pushAge(gi, a, p, true)) return
            prod = { id: p, needBuild: false }
            break
          }
          const si = steps.findIndex((s) => s.kind === 'age' && s.age === a)
          const g = si >= 0 ? goals[steps[si].goalIndex] : null
          const explicit = g?.kind === 'age' && g.age === a && !!g.via
          if (si >= 0 && !explicit) {
            if (steps[si].item) owned.delete(steps[si].item)
            steps[si] = { ...steps[si], item: p, label: `${['', '黑暗', '封建', '城堡', '帝王'][a]}時代（${opt.name}）` }
            owned.add(p)
            prod = { id: p, needBuild: false }
            break
          }
        }
        if (prod) break
      }
    }
    if (!prod) {
      errors.push(`第 ${gi + 1} 個目標：找不到能生產 ${name(id)} 的建築（可能要在前面指定生產它的地標）`)
      return
    }
    if (prod.needBuild) {
      const pAge = minAge(data.items.get(prod.id)!)
      if (pAge > age && !pushAge(gi, pAge, undefined, true)) return
      steps.push({ goalIndex: gi, implicit: true, kind: 'build', item: prod.id, count: 1, forward: false, label: `蓋${name(prod.id)}` })
      owned.add(prod.id)
    }
    if (g.kind === 'army') steps.push({ goalIndex: gi, implicit: false, kind: 'army', item: id, count: g.count, forward: false, label: `${g.count} 名${name(id)}` })
    else steps.push({ goalIndex: gi, implicit: false, kind: 'tech', item: id, count: 1, forward: false, label: `研究${name(id)}` })
  })
  return { steps, errors }
}
