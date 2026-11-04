import { minAge, variationAt, type CivData } from './civData.ts'
import type { Goal } from './types.ts'

export interface Preset {
  id: string
  label: string
  goals: Goal[]
}

/** 封建時代、從生產建築出的第一個軍事單位（找弓兵或長槍兵） */
function feudalUnit(data: CivData): string | null {
  for (const id of ['archer', 'longbowman', 'yumi-ashigaru', 'spearman', 'horseman']) {
    const it = data.items.get(id)
    if (it && minAge(it) <= 2 && it.military) return id
  }
  return null
}

export function presetsFor(data: CivData): Preset[] {
  const out: Preset[] = [
    { id: 'feudal', label: '最快封建', goals: [{ kind: 'age', age: 2 }] },
    { id: 'castle', label: '直城（最快城堡）', goals: [{ kind: 'age', age: 3 }] },
    { id: 'imperial', label: '最快帝王', goals: [{ kind: 'age', age: 4 }] },
  ]
  if (data.items.has('town-center')) {
    out.push({ id: '2tc', label: '封建雙城鎮中心', goals: [{ kind: 'age', age: 2 }, { kind: 'build', item: 'town-center', count: 1 }] })
  }
  const unit = feudalUnit(data)
  if (unit) {
    out.push({ id: 'feudal-army', label: '封建 15 兵', goals: [{ kind: 'age', age: 2 }, { kind: 'army', unit, count: 15 }] })
  }
  if (data.items.has('outpost')) {
    out.push({ id: 'tower-fc', label: '黑暗塔攻 → 直城', goals: [{ kind: 'build', item: 'outpost', count: 2, forward: true }, { kind: 'age', age: 3 }] })
  }
  if (data.abbr === 'ja') {
    out.unshift({
      id: 'ja-tower-gate-samurai',
      label: '黑暗塔攻 → 直城（水鳥居）→ 20 騎馬武士',
      goals: [
        { kind: 'build', item: 'outpost', count: 2, forward: true },
        { kind: 'age', age: 3, via: 'floating-gate' },
        { kind: 'army', unit: 'mounted-samurai', count: 20 },
      ],
    })
  }
  // 城堡時代的招牌單位
  const castleUnit = [...data.items.values()].find((i) => i.unique && i.military && minAge(i) === 3 && variationAt(i, 3).producedBy.length > 0)
  if (castleUnit) {
    out.push({ id: 'castle-unique', label: `直城 → 15 ${data.names[castleUnit.id] ?? castleUnit.name}`, goals: [{ kind: 'age', age: 3 }, { kind: 'army', unit: castleUnit.id, count: 15 }] })
  }
  return out
}
