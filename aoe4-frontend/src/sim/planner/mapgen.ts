// 隨機地圖產生器：只產生自己這一方（1v1）的資源點。
//
// AoE4 的地圖腳本（Content Editor 的 cardinal/playerresources.lua）沒有公開，官方文件只說明：
//   1. 地形表（Terrain Table）放置地形與玩家出生點；
//   2. 每位玩家出生點搭配一組「起始資源地形」，產生標準的資源環；
//   3. 各地形可掛「local distribution」資源組；
//   4. 金礦、石礦另外跑 Distribution_balancing，讓雙方距離相近。
// 所以這裡的做法是：數量用有來源的地圖說明（Dry Arabia 來自 Fandom 資訊欄），
// 距離用「環」的區間加上種子抖動，並明確標示為假設值。

import type { GameMap, Site, SiteKind } from './types.ts'

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface SiteRule {
  kind: SiteKind
  label: string
  amountEach: number
  units: number
  dist: [number, number]
  contested?: boolean
  /** 機率小於 1 時可能不出現 */
  chance?: number
}

export interface MapType {
  id: string
  name: string
  /** 開局在城鎮中心的羊之外，附近可牧回的羊數 */
  nearSheep: number
  rules: SiteRule[]
  notes: string[]
  confidence: 'sourced' | 'qualitative'
}

const gold = (amount: number, dist: [number, number], contested = false, label = '金礦'): SiteRule => ({
  kind: 'gold', label, amountEach: amount, units: amount >= 8000 ? 16 : amount >= 4000 ? 12 : 8, dist, contested,
})
const stone = (amount: number, dist: [number, number], contested = false, label = '石礦'): SiteRule => ({
  kind: 'stone', label, amountEach: amount, units: amount >= 2400 ? 12 : 8, dist, contested,
})
const berry = (bushes: number, dist: [number, number], label = '野果'): SiteRule => ({
  kind: 'berry', label: `${label}（${bushes} 叢）`, amountEach: 250 * bushes, units: bushes, dist,
})
const deer = (n: number, dist: [number, number], label = '鹿群'): SiteRule => ({
  kind: 'deer', label: `${label}（${n} 隻）`, amountEach: 350 * n, units: n, dist,
})
const wood = (trees: number, dist: [number, number], label = '林線'): SiteRule => ({
  kind: 'wood', label, amountEach: 150 * trees, units: trees, dist,
})
const boar = (dist: [number, number], contested = true): SiteRule => ({
  kind: 'boar', label: '野豬', amountEach: 2400, units: 1, dist, contested,
})

// Dry Arabia：Fandom 資訊欄（每位玩家 2 個中型果叢、1 個大型果叢、2 群大型鹿，
// 小金礦 4000 近、遠各 1，大金礦 8000 往地圖中央；小石礦 1200 近、遠，大石礦 2400 往邊緣；
// 16.2 起附近的羊 7 隻）。
const ARABIA: SiteRule[] = [
  berry(6, [9, 13], '近野果'),
  berry(6, [18, 26], '第二片野果'),
  berry(8, [28, 36], '大野果'),
  deer(7, [22, 32], '鹿群 A'),
  deer(7, [30, 42], '鹿群 B'),
  boar([28, 40]),
  wood(40, [8, 12], '主林線'),
  wood(40, [10, 15], '第二林線'),
  wood(80, [22, 32], '外圍森林'),
  gold(4000, [10, 15], false, '近金礦'),
  gold(4000, [20, 28], false, '遠金礦'),
  gold(8000, [36, 46], true, '中央大金礦'),
  stone(1200, [12, 18], false, '近石礦'),
  stone(1200, [22, 30], false, '遠石礦'),
  stone(2400, [32, 42], true, '邊緣大石礦'),
]

const swap = (rules: SiteRule[], drop: (r: SiteRule) => boolean, add: SiteRule[]) => [...rules.filter((r) => !drop(r)), ...add]

export const MAP_TYPES: MapType[] = [
  {
    id: 'dry-arabia',
    name: '乾燥阿拉伯',
    nearSheep: 7,
    rules: ARABIA,
    confidence: 'sourced',
    notes: ['數量來自 Fandom 的 Dry Arabia 資訊欄；17.0 沒有改這張圖。', '所有距離都是假設的區間，Fandom 與官方都沒有公開格數。'],
  },
  {
    id: 'altai',
    name: '阿爾泰',
    nearSheep: 7,
    rules: swap(ARABIA, (r) => r.kind === 'deer', [deer(10, [12, 16], '城鎮中心旁大鹿群'), deer(3, [25, 35], '小鹿群'), deer(3, [32, 44], '小鹿群')]),
    confidence: 'qualitative',
    notes: ['城鎮中心範圍內有一大群鹿，外圍有數群小鹿（搜尋摘要，無法直接讀取頁面）。'],
  },
  {
    id: 'hill-and-dale',
    name: '丘陵與山谷',
    nearSheep: 7,
    rules: ARABIA,
    confidence: 'qualitative',
    notes: ['附近 7 隻羊多在起始高地上；其他資源與阿拉伯相近（質性描述）。'],
  },
  {
    id: 'boulder-bay',
    name: '巨石灣',
    nearSheep: 5,
    rules: swap(ARABIA, (r) => r.kind === 'berry' || r.label === '遠石礦', [
      berry(8, [9, 14], '大野果'),
      berry(8, [18, 26], '大野果'),
      stone(2400, [16, 22], false, '額外大石礦'),
      stone(1200, [22, 30], false, '遠石礦'),
      boar([20, 30], false),
    ]),
    confidence: 'qualitative',
    notes: ['每人 2 個大型果叢、附近少 2 隻羊、多一個大石礦與更多野豬（質性描述）。'],
  },
  {
    id: 'four-lakes',
    name: '四湖',
    nearSheep: 7,
    rules: swap(ARABIA, (r) => r.label === '中央大金礦', [berry(8, [14, 20], '額外大野果'), gold(4000, [36, 46], true, '中央金礦')]),
    confidence: 'qualitative',
    notes: ['在阿拉伯的基礎上多一片大野果，金石略少（質性描述）。'],
  },
  {
    id: 'sunkenlands',
    name: '沉沒之地',
    nearSheep: 7,
    rules: swap(ARABIA, (r) => r.label === '近金礦' || r.label === '遠金礦' || r.kind === 'deer', [
      gold(1600, [10, 15], false, '近小金礦'),
      gold(1600, [18, 24], false, '小金礦'),
      deer(5, [22, 32], '中型鹿群'),
      deer(5, [30, 42], '中型鹿群'),
    ]),
    confidence: 'qualitative',
    notes: ['起始金礦是兩個 tiny（1600），鹿群改成中型（質性描述）。'],
  },
  {
    id: 'prairie',
    name: '大草原',
    nearSheep: 14,
    rules: swap(ARABIA, (r) => r.label === '近金礦', [gold(8000, [10, 15], false, '近大金礦')]),
    confidence: 'qualitative',
    notes: ['1v1 全圖 40 隻以上的羊；17.0 把起始金礦改回大型（官方 patch notes）。'],
  },
]

export function generateMap(typeId: string, seed: number): GameMap {
  const type = MAP_TYPES.find((m) => m.id === typeId) ?? MAP_TYPES[0]
  const r = rng(seed * 7919 + type.id.length)
  const between = ([a, b]: [number, number]) => a + (b - a) * r()
  const sites: Site[] = []
  type.rules.forEach((rule, i) => {
    if (rule.chance != null && r() > rule.chance) return
    sites.push({
      id: `${rule.kind}-${i}`,
      kind: rule.kind,
      label: rule.label,
      amount: rule.amountEach,
      units: rule.units,
      dist: Math.round(between(rule.dist) * 10) / 10,
      angle: r() * Math.PI * 2,
      contested: !!rule.contested,
    })
  })
  // 牧羊：斥候第一次帶羊約 25 秒回來，之後每 15~30 秒帶回 1~2 隻。
  const arrivals: number[] = []
  let t = 22 + r() * 8
  for (let k = 0; k < type.nearSheep; ) {
    const batch = r() < 0.5 ? 1 : 2
    for (let j = 0; j < batch && k < type.nearSheep; j++, k++) arrivals.push(Math.round(t))
    t += 15 + r() * 15
  }
  return {
    typeId: type.id,
    name: type.name,
    seed,
    sites,
    sheepArrivals: arrivals,
    enemyDist: Math.round(85 + r() * 25),
    notes: [
      ...type.notes,
      '牧羊時間（斥候第一隻約 25 秒，之後每 15~30 秒）與兩城距離（85~110 格）是假設。',
    ],
  }
}

export function siteDistance(a: Site | null, b: Site | null) {
  const pa = a ? [Math.cos(a.angle) * a.dist, Math.sin(a.angle) * a.dist] : [0, 0]
  const pb = b ? [Math.cos(b.angle) * b.dist, Math.sin(b.angle) * b.dist] : [0, 0]
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1])
}
