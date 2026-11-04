export type ResourceKey = 'food' | 'wood' | 'gold' | 'stone'

export interface Effect {
  property: string
  effect: 'multiply' | 'change' | string
  value: number
  ids?: string[]
  classes?: string[][]
}

export interface Variation {
  id: string
  age: number
  food: number
  wood: number
  gold: number
  stone: number
  time: number
  pop: number
  producedBy: string[]
  tags: string[]
  cls: string[]
  hp?: number
  speed?: number
  dps?: number
  effects?: Effect[]
  /** 食物、木材、黃金、石頭以外的花費：oliveoil、silver、vizier、muster */
  other?: Record<string, number>
}

export interface VenueCost {
  building: string
  food: number
  wood: number
  gold: number
  stone: number
  time: number
  pop: number
  other?: Record<string, number>
}

export interface CatalogItem {
  id: string
  name: string
  kind: 'unit' | 'building' | 'technology' | 'upgrade'
  minAge: number
  unique: boolean
  military: boolean
  variations: Variation[]
  venues?: VenueCost[]
}

export interface GatherSource {
  id: string
  resource: ResourceKey
  rate: number
  finite: boolean
  label: string
}

export interface Civilization {
  abbr: string
  id: string
  name: string
  slug: string
  expansion: string[]
}

export interface Catalog {
  source: string
  sourceHost: string
  patch: string
  generatedFrom: string
  civilizations: Civilization[]
  gather: {
    carry: number
    note: string
    sources: GatherSource[]
    civRates: Record<string, Record<string, number>>
  }
  items: Record<string, CatalogItem[]>
}
