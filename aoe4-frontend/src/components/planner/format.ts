import { nameOf, type CivData } from '../../sim/planner/civData'
import type { Goal, PlanEvent, SiteKind } from '../../sim/planner/types'

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

export const RES_COLOR = { food: '#e0603a', wood: '#8a5a2b', gold: '#e3b13c', stone: '#8c8c8c' } as const
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
}

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
        rows.push({ key: i, t: e.t, pop: e.pop, kind: 'villager', text: last === m[1] ? `村民 ${m[1]} → ${m[2]}` : `村民 ${m[1]}–${last} → ${m[2]}`, split: events[j].split })
        i = j
        continue
      }
    }
    if (e.kind === 'train') {
      let j = i
      while (j + 1 < events.length && events[j + 1].kind === 'train' && events[j + 1].text === e.text) j++
      const n = j - i + 1
      rows.push({ key: i, t: e.t, pop: events[j].pop, kind: 'train', text: n > 1 ? `${e.text} ×${n}（${clock(e.t)}–${clock(events[j].t)}）` : e.text, split: events[j].split })
      i = j
      continue
    }
    rows.push({ key: i, t: e.t, pop: e.pop, kind: e.kind, text: e.text, split: e.split })
  }
  return rows
}
