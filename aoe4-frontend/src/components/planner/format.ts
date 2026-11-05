import { nameOf, type CivData } from '../../sim/planner/civData'
import type { Goal, PlanEvent, Sample, SiteKind } from '../../sim/planner/types'

export const AGE_ZH = ['', '黑暗', '封建', '城堡', '帝王']

export const SITE_COLOR: Record<SiteKind, string> = {
  sheep: '#f2f2f2',
  berry: '#c2410c',
  deer: '#d97706',
  boar: '#7c2d12',
  wood: '#3f7d3a',
  gold: '#e3b13c',
  stone: '#8c8c8c',
}

export const SITE_ZH: Record<SiteKind, string> = {
  sheep: '羊',
  berry: '野果',
  deer: '鹿',
  boar: '野豬',
  wood: '木材',
  gold: '黃金',
  stone: '石頭',
}

export const RES_COLOR = { food: '#e0603a', wood: '#b07a42', gold: '#e3b13c', stone: '#9aa3ab' } as const
export const RES_LABEL = { food: '食物', wood: '木材', gold: '黃金', stone: '石頭' } as const

export const clock = (s: number | null | undefined) =>
  s == null || !Number.isFinite(s) ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function describeGoal(data: CivData, g: Goal): string {
  switch (g.kind) {
    case 'age':
      return `升到${AGE_ZH[g.age]}時代${g.via ? `（${nameOf(data, g.via)}）` : ''}`
    case 'build':
      return `${g.forward ? '前線' : ''}蓋 ${g.count} 座${nameOf(data, g.item)}`
    case 'army':
      return `訓練 ${g.count} 名${nameOf(data, g.unit)}`
    case 'tech':
      return `研究${nameOf(data, g.item)}`
    case 'villagers':
      return `村民達到 ${g.count} 名`
  }
}

export interface Row {
  key: number
  t: number
  pop: number
  kind: PlanEvent['kind']
  text: string
  split: PlanEvent['split']
  /** 動作前的庫存（村民的錢在排入時就付了，所以就是當下庫存） */
  have?: PlanEvent['bank']
  /** 這列動作花掉的資源（合併的列是總和） */
  cost?: PlanEvent['bank']
  /** cost 是先前排入時就付掉的 */
  prepaid?: boolean
}

type Bundle4 = PlanEvent['bank']
const RES4 = ['food', 'wood', 'gold', 'stone'] as const
const addB = (a: Bundle4, b?: Bundle4): Bundle4 => (b ? { food: a.food + b.food, wood: a.wood + b.wood, gold: a.gold + b.gold, stone: a.stone + b.stone } : { ...a })
/** 動作前的庫存：紀錄裡的庫存已扣掉這次花費，加回來（先付的不加） */
const haveOf = (e: PlanEvent): Bundle4 | undefined => (!e.bank ? undefined : e.cost && !e.prepaid ? addB(e.bank, e.cost) : { ...e.bank })
/** 幾筆紀錄的花費總和；都沒有花費就不給 */
function costSum(list: PlanEvent[]): Bundle4 | undefined {
  let sum: Bundle4 | undefined
  for (const e of list) if (e.cost) sum = addB(sum ?? { food: 0, wood: 0, gold: 0, stone: 0 }, e.cost)
  return sum && RES4.some((r) => sum![r] > 0) ? sum : undefined
}
const money = (list: PlanEvent[]) => ({ have: haveOf(list[0]), cost: costSum(list), ...(list.some((e) => e.prepaid) ? { prepaid: true } : {}) })

/** 把連續的「第 n 名村民 → 木材」合併成「村民 7–9 → 木材」，連續訓練同一單位也合併。 */
export function compress(events: PlanEvent[]): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e.kind === 'villager') {
      const m = e.text.match(/^第 (\d+) 名村民 → (.+)$/)
      if (m) {
        let j = i
        while (j + 1 < events.length && events[j + 1].kind === 'villager' && events[j + 1].text.endsWith(`→ ${m[2]}`)) j++
        const last = events[j].text.match(/^第 (\d+) 名/)?.[1] ?? m[1]
        // 合併多名時寫出各自的時間範圍，人口用最後一名出來後的值，免得看成同時出了好幾名
        const text = last === m[1] ? `第 ${m[1]} 名工人 → ${m[2]}` : `第 ${m[1]}–${last} 名工人 → ${m[2]}（${clock(e.t)}–${clock(events[j].t)} 陸續出）`
        rows.push({ key: i, t: e.t, pop: events[j].pop, kind: 'villager', text, split: events[j].split, ...money(events.slice(i, j + 1)) })
        i = j
        continue
      }
    }
    if (e.kind === 'train') {
      let j = i
      while (j + 1 < events.length && events[j + 1].kind === 'train' && events[j + 1].text === e.text) j++
      const n = j - i + 1
      rows.push({ key: i, t: e.t, pop: events[j].pop, kind: 'train', text: n > 1 ? `${e.text} ×${n}（${clock(e.t)}–${clock(events[j].t)}）` : e.text, split: events[j].split, ...money(events.slice(i, j + 1)) })
      i = j
      continue
    }
    rows.push({ key: i, t: e.t, pop: e.pop, kind: e.kind, text: e.text, split: e.split, ...money([e]) })
  }
  return rows
}

/** 二分搜尋：t 秒時最後一筆取樣 */
export function sampleAt(samples: Sample[], t: number): Sample | null {
  if (!samples.length) return null
  let lo = 0
  let hi = samples.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (samples[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return samples[lo].t <= t ? samples[lo] : samples[0]
}
