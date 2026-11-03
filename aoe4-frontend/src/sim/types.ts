export type ResourceKey = 'food' | 'wood' | 'gold' | 'stone'

export interface Resources {
  food: number
  wood: number
  gold: number
  stone: number
}

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
}

export interface VenueCost {
  building: string
  food: number
  wood: number
  gold: number
  stone: number
  time: number
  pop: number
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

export interface Scenario {
  mode: 'income' | 'age' | 'army' | 'value'
  civ: string
  targetAge: 1 | 2 | 3 | 4
  units: { id: string; count: number }[]
  buildings: { id: string; count: number }[]
  horizon: number
  foodSource: string
  foodAmount: number
  walk: boolean
  dropoffTiles: number
  gatherMultiplier: number
  startFood: number
  startWood: number
  startGold: number
  startStone: number
  startVillagers: number
  incomePerMin: Resources
  incomeVillagers: number
  incomeMode: 'min-villagers' | 'max-weight'
  incomeWeights: Resources
}

export interface Policy {
  villsBefore: number[]
  finalVills: number
  landmark: Partial<Record<number, string>>
  builders: number
  copies: number
  eco: boolean
  spamUnit?: string
}

export interface Sample {
  t: number
  food: number
  wood: number
  gold: number
  stone: number
  villagers: number
  onFood: number
  onWood: number
  onGold: number
  onStone: number
  building: number
  age: number
  army: number
}

export interface SimEvent {
  t: number
  text: string
}

export interface SolveResult {
  feasible: boolean
  objective: number
  objectiveLabel: string
  summary: string
  formulation: string
  timeline: Sample[]
  events: SimEvent[]
  notes: string[]
  tried: number
  policy: Policy | null
  age: number
  villagers: number
  armyValue: number
}
