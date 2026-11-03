import type { Catalog, CatalogItem, Scenario } from './types.ts'

export interface CivScenario {
  id: string
  label: string
  detail: string
  mode: Scenario['mode']
  targetAge: Scenario['targetAge']
  units: { id: string; count: number }[]
  buildings: { id: string; count: number }[]
  horizon: number
}

const AGE = ['', '黑暗時代', '封建時代', '城堡時代', '帝王時代']
const SUPPORT = new Set([
  'scout', 'king', 'trader', 'imperial-official', 'prelate', 'scholar', 'emissary', 'dervish',
])
const DARK_TOWERS = ['outpost', 'fortified-outpost', 'toll-outpost', 'tower-house']

function isLandmark(item: CatalogItem): boolean {
  return item.variations.some((variation) => variation.tags.some((tag) => tag.startsWith('toAge')))
}

function hasAge(items: CatalogItem[], tag: string): boolean {
  return items.some((item) => item.variations.some((variation) => variation.tags.includes(tag)))
}

function costText(item: CatalogItem): string {
  const variation = item.variations[0]
  if (!variation) return item.name
  const parts = [
    variation.food ? `${variation.food} 食物` : '',
    variation.wood ? `${variation.wood} 木材` : '',
    variation.gold ? `${variation.gold} 黃金` : '',
    variation.stone ? `${variation.stone} 石頭` : '',
  ].filter(Boolean)
  return `${item.name}：${parts.join('、') || '無資源'}，${variation.time} 秒`
}

function hasProducer(items: CatalogItem[], unit: CatalogItem): boolean {
  const producedBy = unit.variations[0]?.producedBy ?? []
  return producedBy.some((id) => {
    const building = items.find((item) => item.id === id)
    if (!building || building.kind !== 'building' || isLandmark(building)) return false
    return building.minAge <= unit.minAge
  })
}

function isSiege(item: CatalogItem): boolean {
  return /ram|trebuchet|cannon|ribauld|bomb/i.test(item.id)
    || item.variations.some((variation) => variation.cls.some((name) => /siege/i.test(name)))
}

function darkFighters(items: CatalogItem[]): CatalogItem[] {
  return items
    .filter((item) => item.kind === 'unit' && item.military && item.minAge <= 1)
    .filter((item) => !SUPPORT.has(item.id) && !isSiege(item))
    .filter((item) => (item.variations[0]?.pop ?? 0) > 0)
    .filter((item) => hasProducer(items, item))
    .sort((a, b) => {
      const levyA = a.id.includes('levy') ? 1 : 0
      const levyB = b.id.includes('levy') ? 1 : 0
      return levyA - levyB || Number(b.unique) - Number(a.unique) || a.name.localeCompare(b.name)
    })
}

function signatureUnits(items: CatalogItem[]): CatalogItem[] {
  return items
    .filter((item) => item.kind === 'unit' && item.military && item.unique && item.minAge >= 2 && item.minAge <= 3)
    .filter((item) => !SUPPORT.has(item.id))
    .filter((item) => (item.variations[0]?.pop ?? 0) > 0 && !isSiege(item))
    .filter((item) => hasProducer(items, item))
    .sort((a, b) => a.minAge - b.minAge || a.name.localeCompare(b.name))
    .slice(0, 3)
}

function darkTower(items: CatalogItem[]): CatalogItem | undefined {
  return items.find((item) => item.kind === 'building'
    && item.minAge <= 1
    && DARK_TOWERS.includes(item.id)
    && !isLandmark(item))
}

export function scenariosFor(catalog: Catalog, abbr: string): CivScenario[] {
  const items = catalog.items[abbr] ?? []
  const list: CivScenario[] = []
  if (hasAge(items, 'toAge2')) {
    list.push({
      id: 'age-2',
      label: '最快封建',
      detail: '固定村民人數，把還缺的食物與黃金分配到能最早完成這個文明的封建升代。',
      mode: 'age',
      targetAge: 2,
      units: [],
      buildings: [],
      horizon: 900,
    })
  }
  if (hasAge(items, 'toAge3')) {
    list.push({
      id: 'age-3',
      label: '最快城堡',
      detail: '先解封建階段的資源，升代後再解城堡地標的食物、黃金與建造人力。',
      mode: 'age',
      targetAge: 3,
      units: [],
      buildings: [],
      horizon: 1500,
    })
  }
  if (hasAge(items, 'toAge4')) {
    list.push({
      id: 'age-4',
      label: '最快帝王',
      detail: '三段升代各自解一次線性分配，搜尋每個時代要先養到幾個村民、幾個上去蓋地標。',
      mode: 'age',
      targetAge: 4,
      units: [],
      buildings: [],
      horizon: 2400,
    })
  }

  const townCenter = items.find((item) => item.kind === 'building' && item.id === 'town-center')
  if (townCenter) {
    // AoE4 World 的 town-center.minAge 常是 1，那是實體標籤，不是建造選單。
    // 第二座城鎮中心從封建時代才能蓋；開局那座是首都城鎮中心。
    const age = Math.min(4, Math.max(2, townCenter.minAge)) as Scenario['targetAge']
    list.push({
      id: 'second-tc',
      label: `最快第二城鎮中心（先到${AGE[age]}）`,
      detail: `${costText(townCenter)}。黑暗時代不能蓋第二座城鎮中心，要先升到${AGE[age]}。首都城鎮中心是開局就有的，不算這次建造。`,
      mode: 'age',
      targetAge: age,
      units: [],
      buildings: [{ id: townCenter.id, count: 1 }],
      horizon: 1800,
    })
  }

  const tower = darkTower(items)
  if (tower) {
    const generic = tower.id === 'outpost'
    const towerCount = generic ? 3 : 2
    list.push({
      id: 'towers',
      label: generic ? `立塔封鎖後最快封建（${tower.name} ×${towerCount}）` : `先蓋 ${tower.name} ×${towerCount}，再最快封建`,
      detail: `${costText(tower)}。先把塔蓋完來封鎖資源，塔全部完成前不升代。之後立刻把村民轉去升封建。時間是進入封建的時刻，時間軸會標出塔完成的時刻。`,
      mode: 'age',
      targetAge: 2,
      units: [],
      buildings: [{ id: tower.id, count: towerCount }],
      horizon: 1800,
    })
    list.push({
      id: 'dark-rush',
      label: `黑暗快攻立塔後最快封建（${tower.name} ×2）`,
      detail: `先用 ${tower.name} ×2 封鎖對方資源，塔完成前不蓋地標。封鎖完成後立刻升封建，不在黑暗時代把村民堆到十幾個再行動。`,
      mode: 'age',
      targetAge: 2,
      units: [],
      buildings: [{ id: tower.id, count: 2 }],
      horizon: 1800,
    })
  }

  for (const unit of signatureUnits(items)) {
    list.push({
      id: `army-${unit.id}`,
      label: `最快 8 名 ${unit.name}`,
      detail: `${unit.name} 從${AGE[unit.minAge]}開始。先補齊升代資源，再分配生產建築與訓練花費。數量可改。`,
      mode: 'army',
      targetAge: Math.min(4, Math.max(1, unit.minAge)) as Scenario['targetAge'],
      units: [{ id: unit.id, count: 8 }],
      buildings: [],
      horizon: 1800,
    })
  }

  const custom = items.find((item) => item.kind === 'unit' && item.military && item.minAge <= 2 && hasProducer(items, item) && !SUPPORT.has(item.id))
  if (custom) {
    list.push({
      id: 'custom-army',
      label: '自訂這個文明的部隊',
      detail: '單位清單只含這個文明資料裡的軍事單位。',
      mode: 'army',
      targetAge: Math.min(4, Math.max(2, custom.minAge)) as Scenario['targetAge'],
      units: [{ id: custom.id, count: 8 }],
      buildings: [],
      horizon: 1800,
    })
  }

  list.push({
    id: 'income',
    label: '收入配比',
    detail: '把每分鐘的食物、木材、黃金、石頭寫成線性目標，求最少村民，或在固定人數下讓加權收入最大。',
    mode: 'income',
    targetAge: 1,
    units: [],
    buildings: [],
    horizon: 60,
  })
  return list
}
