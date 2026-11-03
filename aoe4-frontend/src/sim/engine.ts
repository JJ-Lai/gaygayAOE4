import { allocateInteger, canAfford, formatLp, pay, resOf, timeUntil, totalRes, ZERO } from './linear.ts'
import { buildPace, openingFor } from './openings.ts'
import type {
  Catalog,
  CatalogItem,
  Effect,
  Policy,
  Resources,
  Sample,
  Scenario,
  SimEvent,
  SolveResult,
  Variation,
} from './types.ts'

const POP_PER_HOUSE = 10
const POP_TC = 10
const FARM_BASE = 8
const LABELS: Record<string, string> = {
  food: '食物',
  wood: '木材',
  gold: '黃金',
  stone: '石頭',
}

interface Owned {
  itemId: string
  busyUntil: number
}

interface Task {
  kind: 'build' | 'train' | 'research'
  itemId: string
  doneAt: number
  builders: number
  owner: number
  pop: number
}

interface CivIndex {
  abbr: string
  byId: Map<string, CatalogItem>
  villager: CatalogItem
  houses: CatalogItem[]
  farms: CatalogItem[]
  mills: CatalogItem[]
  military: CatalogItem[]
  ageUps: Record<number, { item: CatalogItem; variation: Variation }[]>
  tcId: string
  workerCap: number
}

function emptyResult(notes: string[], formulation = ''): SolveResult {
  return {
    feasible: false,
    objective: Number.POSITIVE_INFINITY,
    objectiveLabel: '無解',
    summary: '這個條件下找不到可行配置。',
    formulation,
    timeline: [],
    events: [],
    notes,
    tried: 0,
    policy: null,
    age: 1,
    villagers: 0,
    armyValue: 0,
  }
}

export function clock(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  const rounded = Math.max(0, Math.round(seconds))
  const min = Math.floor(rounded / 60)
  const sec = rounded % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function variationAt(item: CatalogItem, age: number): Variation | null {
  let best: Variation | null = null
  for (const variation of item.variations) {
    if (variation.age <= age && (!best || variation.age >= best.age)) best = variation
  }
  return best
}

function costOf(variation: Variation, venue?: Variation['producedBy'][number] | null, item?: CatalogItem): Resources & { time: number; pop: number } {
  if (item?.venues && venue) {
    const special = item.venues.find((row) => row.building === venue)
    if (special) {
      return {
        food: special.food,
        wood: special.wood,
        gold: special.gold,
        stone: special.stone,
        time: special.time,
        pop: special.pop,
      }
    }
  }
  return {
    food: variation.food,
    wood: variation.wood,
    gold: variation.gold,
    stone: variation.stone,
    time: variation.time,
    pop: variation.pop,
  }
}

function indexCiv(catalog: Catalog, abbr: string): CivIndex | null {
  const list = catalog.items[abbr]
  if (!list) return null
  const byId = new Map(list.map((item) => [item.id, item]))
  const opening = openingFor(abbr)
  const villager = (opening.workerId ? list.find((item) => item.id === opening.workerId) : undefined)
    ?? list.find((item) => item.variations.some((variation) => variation.tags.includes('villager')))
  if (!villager) return null
  const ageUps: CivIndex['ageUps'] = { 2: [], 3: [], 4: [] }
  for (const item of list) {
    for (const variation of item.variations) {
      for (const tag of variation.tags) {
        if (tag === 'toAge2' || tag === 'toAge3' || tag === 'toAge4') {
          const age = Number(tag.slice(5))
          if (!ageUps[age].some((row) => row.item.id === item.id && row.variation.age === variation.age)) {
            ageUps[age].push({ item, variation })
          }
        }
      }
    }
  }
  for (const age of [2, 3, 4]) {
    ageUps[age].sort((a, b) => totalRes(a.variation) - totalRes(b.variation) || a.variation.time - b.variation.time)
  }
  const producedBy = variationAt(villager, 1)?.producedBy ?? []
  const tcId = producedBy.find((id) => byId.get(id)?.variations.some((v) => v.tags.includes('tc')))
    || producedBy[0]
    || 'capital-town-center'
  return {
    abbr,
    byId,
    villager,
    houses: list.filter((item) => item.variations.some((v) => v.tags.includes('house'))),
    farms: list.filter((item) => item.kind === 'building' && item.variations.some((v) => v.tags.includes('farm'))),
    mills: list.filter((item) => item.id === 'mill' || item.id.endsWith('-mill')),
    military: list.filter((item) => item.military),
    ageUps,
    tcId,
    workerCap: opening.workerCap,
  }
}

function baseRate(catalog: Catalog, civ: string, sourceId: string): number {
  return catalog.gather.civRates[civ]?.[sourceId]
    ?? catalog.gather.sources.find((source) => source.id === sourceId)?.rate
    ?? 0
}

function effectMatches(effect: Effect, item: CatalogItem, variation: Variation): boolean {
  if (!effect) return false
  if (effect.ids?.length && effect.ids.includes(item.id)) return true
  if (effect.classes?.length) {
    return effect.classes.some((group) => group.every((token) => variation.cls.includes(token)))
  }
  return false
}

function sourceLabel(catalog: Catalog, id: string): string {
  return catalog.gather.sources.find((source) => source.id === id)?.label ?? id
}

function regularProducer(index: CivIndex, item: CatalogItem, age: number): CatalogItem | null {
  const variation = variationAt(item, Math.max(age, item.minAge))
  if (!variation) return null
  const candidates: CatalogItem[] = []
  for (const id of variation.producedBy) {
    const building = index.byId.get(id)
    if (!building || building.kind !== 'building') continue
    const buildingVariation = variationAt(building, 4)
    if (!buildingVariation) continue
    const landmark = buildingVariation.tags.some((tag) => tag.startsWith('toAge'))
    const production = building.variations.some((row) => row.tags.includes('production'))
    if (landmark || !production) continue
    if (building.minAge > Math.max(item.minAge, age) && building.minAge > item.minAge) continue
    candidates.push(building)
  }
  candidates.sort((a, b) => {
    const av = variationAt(a, 4)
    const bv = variationAt(b, 4)
    return totalRes(av || ZERO) - totalRes(bv || ZERO)
  })
  return candidates[0] ?? null
}

function solveIncome(catalog: Catalog, scenario: Scenario): SolveResult {
  const index = indexCiv(catalog, scenario.civ)
  const notes = [
    '收入模型是穩態線性規劃：每個資源只用你選的來源，不計算羊群耗盡。',
  ]
  if (!index) return emptyResult(['這個文明沒有村民資料。'])
  const opening = openingFor(scenario.civ)
  const villager = variationAt(index.villager, 1)
  const speed = (villager?.speed || 1.125) * (scenario.walk ? 1 : 1)
  const carry = catalog.gather.carry + opening.carryBonus
  const rates = { ...ZERO }
  const foodId = scenario.foodSource
  const tuned = (id: string, resource: keyof Resources, hunt = false) => {
    const workerRate = id === 'farm' ? (opening.farmGather ?? opening.gather) : opening.gather
    let rate = baseRate(catalog, scenario.civ, id) * scenario.gatherMultiplier * workerRate
    if (hunt) rate *= 1
    if (scenario.walk && scenario.dropoffTiles > 0 && rate > 0) {
      const gatherTime = carry / rate
      const walkTime = (2 * scenario.dropoffTiles) / Math.max(0.1, speed)
      rate = carry / (gatherTime + walkTime)
    }
    rates[resource] = rate
  }
  tuned(foodId, 'food', foodId === 'deer' || foodId === 'boar')
  tuned('wood', 'wood')
  tuned('gold', 'gold')
  tuned('stone', 'stone')

  if (scenario.incomeMode === 'min-villagers') {
    const perSec = {
      food: scenario.incomePerMin.food / 60,
      wood: scenario.incomePerMin.wood / 60,
      gold: scenario.incomePerMin.gold / 60,
      stone: scenario.incomePerMin.stone / 60,
    }
    const assign = { ...ZERO }
    for (const key of ['food', 'wood', 'gold', 'stone'] as const) {
      const exact = perSec[key] <= 0 ? 0 : rates[key] <= 0 ? Number.POSITIVE_INFINITY : perSec[key] / rates[key]
      assign[key] = Number.isFinite(exact) ? Math.ceil(exact - 1e-9) : exact
    }
    const villagers = assign.food + assign.wood + assign.gold + assign.stone
    const lines = [
      '最小化  v_食物 + v_木材 + v_黃金 + v_石頭',
      '條件',
    ]
    for (const key of ['food', 'wood', 'gold', 'stone'] as const) {
      if (perSec[key] <= 0) continue
      lines.push(`  ${rates[key].toFixed(3)} · v_${LABELS[key]}  ≥  ${perSec[key].toFixed(3)}    （${scenario.incomePerMin[key]} / 分）`)
    }
    lines.push('  v ≥ 0 且為整數')
    lines.push('解')
    for (const key of ['food', 'wood', 'gold', 'stone'] as const) {
      if (assign[key] <= 0) continue
      lines.push(`  v_${LABELS[key]} = ${assign[key]}`)
    }
    lines.push(`  村民合計 = ${villagers}`)
    const timeline = projectBank(scenario, assign, rates, 180)
    return {
      feasible: Number.isFinite(villagers),
      objective: villagers,
      objectiveLabel: `${villagers} 村民`,
      summary: `要達到每分鐘 ${scenario.incomePerMin.food} 食物 / ${scenario.incomePerMin.wood} 木材 / ${scenario.incomePerMin.gold} 黃金 / ${scenario.incomePerMin.stone} 石頭，最少需要 ${villagers} 名村民。每個資源都向上取整，避免人數不夠。食物來源是${sourceLabel(catalog, foodId)}。`,
      formulation: lines.join('\n'),
      timeline,
      events: [{ t: 0, text: '穩態分配開始，之後不再改變' }],
      notes,
      tried: 1,
      policy: null,
      age: 1,
      villagers,
      armyValue: 0,
    }
  }

  const keys = ['food', 'wood', 'gold', 'stone'] as const
  let bestKey: typeof keys[number] = 'food'
  let bestScore = -1
  for (const key of keys) {
    const score = scenario.incomeWeights[key] * rates[key]
    if (score > bestScore) {
      bestScore = score
      bestKey = key
    }
  }
  const assign = { ...ZERO, [bestKey]: scenario.incomeVillagers }
  const incomePerMin = rates[bestKey] * scenario.incomeVillagers * 60
  const lines = [
    '最大化  w_食物·y_食物 + w_木材·y_木材 + w_黃金·y_黃金 + w_石頭·y_石頭',
    '條件',
    `  y_r = rate_r · v_r`,
    `  v_食物 + v_木材 + v_黃金 + v_石頭 = ${scenario.incomeVillagers}`,
    '  v ≥ 0',
    '解',
    `  全部 ${scenario.incomeVillagers} 名村民放在${LABELS[bestKey]}（權重 ${scenario.incomeWeights[bestKey]} × 速率 ${rates[bestKey].toFixed(3)}）`,
    `  產量 = ${incomePerMin.toFixed(0)} / 分`,
  ]
  return {
    feasible: true,
    objective: incomePerMin,
    objectiveLabel: `${incomePerMin.toFixed(0)} / 分`,
    summary: `在 ${scenario.incomeVillagers} 名村民、線性產量的限制下，加權收入最大的配置是全員採${LABELS[bestKey]}。`,
    formulation: lines.join('\n'),
    timeline: projectBank(scenario, assign, rates, 180),
    events: [{ t: 0, text: `全員改採${LABELS[bestKey]}` }],
    notes,
    tried: 1,
    policy: null,
    age: 1,
    villagers: scenario.incomeVillagers,
    armyValue: 0,
  }
}

function projectBank(scenario: Scenario, assign: Resources, rates: Resources, seconds: number): Sample[] {
  const samples: Sample[] = []
  for (let t = 0; t <= seconds; t += 15) {
    samples.push({
      t,
      food: scenario.startFood + assign.food * rates.food * t,
      wood: scenario.startWood + assign.wood * rates.wood * t,
      gold: scenario.startGold + assign.gold * rates.gold * t,
      stone: scenario.startStone + assign.stone * rates.stone * t,
      villagers: assign.food + assign.wood + assign.gold + assign.stone,
      onFood: assign.food,
      onWood: assign.wood,
      onGold: assign.gold,
      onStone: assign.stone,
      building: 0,
      age: 1,
      army: 0,
    })
  }
  return samples
}

interface RunOptions {
  desiredAge: number
  goals: { id: string; count: number }[]
  buildings: { id: string; count: number }[]
  spam: boolean
}

function runPolicy(catalog: Catalog, scenario: Scenario, index: CivIndex, policy: Policy, options: RunOptions): SolveResult {
  const opening = openingFor(scenario.civ)
  const notes: string[] = []
  const events: SimEvent[] = []
  const timeline: Sample[] = []
  let formulation = ''
  const bank = resOf(scenario.startFood, scenario.startWood, scenario.startGold, scenario.startStone)
  let time = 0
  let age = 1
  let villagers = scenario.startVillagers
  let popCap = POP_TC
  let popUsed = villagers
  let foodPool = scenario.foodSource === 'farm' ? Number.POSITIVE_INFINITY : scenario.foodAmount
  let source = scenario.foodSource
  let woodDebt = 0
  let farms = 0
  let millPaid = index.mills.length === 0
  const owned: Owned[] = [{ itemId: index.tcId, busyUntil: 0 }]
  let tasks: Task[] = []
  const doneUnits = new Map<string, number>()
  const researched = new Set<string>()
  const effects: NonNullable<Variation['effects']> = []
  let armyValue = 0
  let met = options.desiredAge <= 1 && options.goals.length === 0 && options.buildings.length === 0 && !options.spam
  let chainAge = 0
  let cisternAura = false
  let blockadeAt = -1
  const villagerBase = variationAt(index.villager, 1)
  if (!villagerBase) return emptyResult(['缺少村民資料'])
  const villagerVariation = villagerBase
  if (!index.houses.length) {
    popCap = 200
    notes.push('這個文明沒有一般房屋。人口上限暫以 200 計算，蒙古等文明的實際人口建築沒有逐棟建模。')
  }

  for (const item of index.byId.values()) {
    for (const variation of item.variations) {
      if (!variation.effects) continue
      if (variation.time > 0) continue
      if (variation.food + variation.wood + variation.gold + variation.stone > 0) continue
      if (variation.age > 1) continue
      effects.push(...variation.effects)
      researched.add(item.id)
    }
  }

  const affectsWorker = (effect: Effect) => !effect.ids?.length
    || effect.ids.includes('villager')
    || effect.ids.includes(index.villager.id)

  const carryBonus = () => effects
    .filter((effect) => effect.property === 'carryCapacity' && effect.effect === 'change' && affectsWorker(effect))
    .reduce((sum, effect) => sum + effect.value, 0)

  const speedBonus = () => effects
    .filter((effect) => effect.property === 'moveSpeed' && effect.effect === 'multiply' && affectsWorker(effect))
    .reduce((product, effect) => product * effect.value, 1)

  const gatherBonus = (property: string) => effects
    .filter((effect) => effect.property === property && effect.effect === 'multiply' && affectsWorker(effect))
    .reduce((product, effect) => product * effect.value, 1)

  const workerQueued = () => tasks.filter((task) => task.itemId === index.villager.id).length

  function pushEvent(text: string) {
    if (events.length < 240) events.push({ t: time, text })
  }

  function trainTime(item: CatalogItem, variation: Variation, base: number): number {
    let value = base
    for (const effect of effects) {
      if (effect.property !== 'buildTime' || effect.effect !== 'multiply') continue
      if (effectMatches(effect, item, variation)) value *= effect.value
    }
    return value
  }

  function rates(): Resources {
    const foodProperty = source === 'deer' || source === 'boar' ? 'huntGatherRate' : 'foodGatherRate'
    const hunt = source === 'deer' || source === 'boar' ? gatherBonus('huntGatherRate') : 1
    const berry = source === 'berry' ? gatherBonus('berryGatherRate') : 1
    const foodMul = gatherBonus('foodGatherRate') * (foodProperty === 'huntGatherRate' ? hunt : 1) * berry
    const workerRate = (id: string) => (id === 'farm' ? (opening.farmGather ?? opening.gather) : opening.gather)
    const map: Record<string, number> = {
      [source]: baseRate(catalog, scenario.civ, source) * scenario.gatherMultiplier * foodMul * workerRate(source),
      wood: baseRate(catalog, scenario.civ, 'wood') * scenario.gatherMultiplier * gatherBonus('woodGatherRate') * workerRate('wood'),
      gold: baseRate(catalog, scenario.civ, 'gold') * scenario.gatherMultiplier * gatherBonus('goldGatherRate') * workerRate('gold'),
      stone: baseRate(catalog, scenario.civ, 'stone') * scenario.gatherMultiplier * gatherBonus('stoneGatherRate') * workerRate('stone'),
    }
    if (source === 'deer' || source === 'boar') {
      map[source] = baseRate(catalog, scenario.civ, source) * scenario.gatherMultiplier * gatherBonus('foodGatherRate') * gatherBonus('huntGatherRate') * workerRate(source)
    }
    const carry = catalog.gather.carry + opening.carryBonus + carryBonus()
    const speed = Math.max(0.2, (villagerVariation?.speed || 1.125) * speedBonus())
    const out = { ...ZERO }
    const apply = (id: string, key: keyof Resources) => {
      let rate = map[id] ?? 0
      if (scenario.walk && scenario.dropoffTiles > 0 && rate > 0) {
        rate = carry / (carry / rate + (2 * scenario.dropoffTiles) / speed)
      }
      out[key] = rate
    }
    apply(source, 'food')
    apply('wood', 'wood')
    apply('gold', 'gold')
    apply('stone', 'stone')
    if (woodDebt > 1e-6) out.food = 0
    return out
  }

  function buildersBusy(): number {
    return tasks.filter((task) => task.kind === 'build' && task.doneAt > time).reduce((sum, task) => sum + task.builders, 0)
  }

  function owns(itemId: string): boolean {
    return owned.some((building) => building.itemId === itemId)
  }

  function ageGoal(targetAge: number) {
    return index.ageUps[targetAge]?.find((row) => row.item.id === policy.landmark[targetAge])
      ?? index.ageUps[targetAge]?.[0]
  }

  function remainingGoals(): { item: CatalogItem; left: number }[] {
    if (options.spam && policy.spamUnit) {
      const item = index.byId.get(policy.spamUnit)
      return item ? [{ item, left: 99 }] : []
    }
    const rows = []
    for (const goal of options.goals) {
      const item = index.byId.get(goal.id)
      if (!item) continue
      const finished = doneUnits.get(goal.id) ?? 0
      const queued = tasks.filter((task) => task.kind === 'train' && task.itemId === goal.id).length
      const left = goal.count - finished - queued
      if (left > 0) rows.push({ item, left })
    }
    return rows
  }

  function armyPopLeft(): number {
    if (options.spam) return 20
    return options.goals.reduce((sum, goal) => {
      const item = index.byId.get(goal.id)
      const variation = item ? variationAt(item, Math.max(age, item.minAge)) : null
      const have = doneUnits.get(goal.id) ?? 0
      return sum + Math.max(0, goal.count - have) * (variation?.pop ?? 1)
    }, 0)
  }

  function needBundle(): Resources {
    const need = { ...ZERO }
    if (woodDebt > 0) need.wood += woodDebt
    if (age < options.desiredAge && chainAge < age + 1 && !denialLeft()) {
      const goal = ageGoal(age + 1)
      if (goal) {
        const producerId = goal.item.kind === 'building' ? null : goal.variation.producedBy.find((id) => id !== index.tcId && !owns(id))
        if (producerId) {
          const producer = index.byId.get(producerId)
          const producerVariation = producer ? variationAt(producer, age) ?? producer.variations[0] : null
          if (producerVariation) {
            need.food += producerVariation.food
            need.wood += producerVariation.wood
            need.gold += producerVariation.gold
            need.stone += producerVariation.stone
          }
        } else {
          need.food += Math.max(0, goal.variation.food - bank.food)
          need.wood += Math.max(0, goal.variation.wood - bank.wood)
          need.gold += Math.max(0, goal.variation.gold - bank.gold)
          need.stone += Math.max(0, goal.variation.stone - bank.stone)
        }
      }
    } else {
      for (const goal of remainingGoals()) {
        const variation = variationAt(goal.item, age)
        if (!variation) continue
        const producer = regularProducer(index, goal.item, age)
        const have = owned.filter((building) => building.itemId === producer?.id).length
          + tasks.filter((task) => task.kind === 'build' && task.itemId === producer?.id).length
        if (producer && have < policy.copies) {
          const buildingVariation = variationAt(producer, age) ?? producer.variations[0]
          const missing = policy.copies - have
          need.wood += buildingVariation.wood * missing
          need.food += buildingVariation.food * missing
          need.gold += buildingVariation.gold * missing
          need.stone += buildingVariation.stone * missing
        }
        const unitCost = costOf(variation, producer?.id, goal.item)
        const left = options.spam ? 2 : goal.left
        need.food += unitCost.food * left
        need.wood += unitCost.wood * left
        need.gold += unitCost.gold * left
        need.stone += unitCost.stone * left
      }
    }
    const house = cheapestHouse()
    const housesQueued = tasks.filter((task) => task.kind === 'build' && index.byId.get(task.itemId)?.variations.some((v) => v.tags.includes('house'))).length
    const slots = popCap - popUsed
    if (house && housesQueued === 0 && (slots <= 2 || (age >= options.desiredAge && slots < armyPopLeft()))) {
      const houseVariation = variationAt(house, age) ?? house.variations[0]
      need.wood += houseVariation.wood
    }
    addStructureNeeds(need)
    const cistern = cisternWorth()
    if (cistern) {
      need.stone += Math.max(0, cistern.stone - bank.stone)
    }
    return need
  }

  function cisternWorth(): Variation | null {
    if (!policy.eco || cisternAura) return null
    const item = index.byId.get('cistern')
    if (!item || owns('cistern') || tasks.some((task) => task.kind === 'build' && task.itemId === 'cistern')) return null
    const variation = variationAt(item, age) ?? item.variations[0]
    if (!variation || variation.age > age) return null
    const mult = 1.1
    const horizon = options.desiredAge >= 4 ? 800 : options.desiredAge === 3 ? 480 : options.goals.length || options.buildings.length ? 420 : 240
    const missingStone = Math.max(0, variation.stone - bank.stone)
    const one = baseRate(catalog, scenario.civ, 'stone') * opening.gather
    const delay = (missingStone <= 0 ? 0 : missingStone / Math.max(one, 1e-6)) + variation.time
    if (!(delay + horizon / mult < horizon - 1) || !Number.isFinite(delay)) return null
    return variation
  }

  function structureProgress(id: string): number {
    const finished = owned.filter((building) => building.itemId === id).length
    const queued = tasks.filter((task) => task.kind === 'build' && task.itemId === id).length
    return finished + queued
  }

  function addStructureNeeds(need: Resources) {
    let food = 0
    let wood = 0
    let gold = 0
    let stone = 0
    for (const goal of options.buildings) {
      const item = index.byId.get(goal.id)
      if (!item) continue
      const left = goal.count - structureProgress(goal.id)
      if (left <= 0) continue
      const variation = variationAt(item, Math.max(age, item.minAge)) ?? item.variations[0]
      food += variation.food * left
      wood += variation.wood * left
      gold += variation.gold * left
      stone += variation.stone * left
    }
    need.food += Math.max(0, food - bank.food)
    need.wood += Math.max(0, wood - bank.wood)
    need.gold += Math.max(0, gold - bank.gold)
    need.stone += Math.max(0, stone - bank.stone)
  }

  function cheapestHouse(): CatalogItem | null {
    const available = index.houses.filter((item) => item.minAge <= age)
    available.sort((a, b) => totalRes(variationAt(a, age) || ZERO) - totalRes(variationAt(b, age) || ZERO))
    return available[0] ?? null
  }

  function snapshot(assign: Resources) {
    if (timeline.length > 360) return
    timeline.push({
      t: time,
      food: bank.food,
      wood: bank.wood,
      gold: bank.gold,
      stone: bank.stone,
      villagers,
      onFood: assign.food,
      onWood: assign.wood,
      onGold: assign.gold,
      onStone: assign.stone,
      building: buildersBusy(),
      age,
      army: armyValue,
    })
  }

  function villagerNow(): Variation {
    return variationAt(index.villager, age) ?? villagerVariation
  }

  function villagerQueuedTask(): Task | undefined {
    return tasks.find((task) => task.kind === 'train' && task.itemId === index.villager.id)
  }

  function headcount(cost: number, rate: number): number {
    const variation = villagerNow()
    if (cost <= 0 || variation.time <= 0 || rate <= 1e-8) return 0
    return Math.ceil((cost / variation.time) / rate - 1e-9)
  }

  function sustainFood(): number {
    return headcount(villagerNow().food, rates().food)
  }

  function sustainGold(): number {
    return headcount(villagerNow().gold, rates().gold)
  }

  function maxBuilders(): number {
    return Math.max(0, Math.floor(villagers - sustainFood() - sustainGold() + 1e-9))
  }

  function reserveHolds(resource: 'food' | 'gold', spent: number): boolean {
    const variation = villagerNow()
    const need = variation[resource]
    if (need <= 1e-6) return true
    const after = bank[resource] - spent
    const queued = villagerQueuedTask()
    if (!queued) return after + 1e-6 >= need
    const wait = Math.max(0, queued.doneAt - time)
    return after + assignment().income[resource] * wait + 1e-6 >= need
  }

  function keepsVillagersGoing(cost: Resources): boolean {
    if (!canAfford(bank, cost)) return false
    if (cost.food <= 1e-6 && cost.gold <= 1e-6) return true
    if (cost.food > 1e-6 && !reserveHolds('food', cost.food)) return false
    if (cost.gold > 1e-6 && !reserveHolds('gold', cost.gold)) return false
    return true
  }

  function splitText(): string {
    const assign = assignment().assign
    const parts = (['food', 'wood', 'gold', 'stone'] as const)
      .filter((key) => assign[key] >= 0.05)
      .map((key) => `${LABELS[key]} ${Math.round(assign[key])}`)
    const building = buildersBusy()
    if (building > 0) parts.push(`建造 ${building}`)
    return `${opening.workerLabel} ${villagers}：${parts.join('、') || '沒有人在採集'}`
  }

  function assignment() {
    const free = Math.max(0, Math.round(villagers - buildersBusy()))
    const foodLock = Math.min(free, sustainFood())
    const goldLock = Math.min(Math.max(0, free - foodLock), sustainGold())
    const plan = allocateInteger(Math.max(0, free - foodLock - goldLock), needBundle(), rates())
    const rate = rates()
    plan.assign.food += foodLock
    plan.assign.gold += goldLock
    plan.income.food += foodLock * rate.food
    plan.income.gold += goldLock * rate.gold
    return plan
  }

  function rememberLp(title: string) {
    const plan = assignment()
    if (formulation && plan.seconds < 1) return
    const variation = villagerNow()
    const foodLock = sustainFood()
    const goldLock = sustainGold()
    const goldLine = variation.gold > 0 ? `，v_黃金 ≥ ${goldLock}（每 ${variation.time} 秒 ${variation.gold} 黃金）` : ''
    const text = `${formatLp({
      title,
      villagers: Math.max(0, villagers - buildersBusy()),
      need: needBundle(),
      rates: rates(),
      assign: plan.assign,
      seconds: plan.seconds,
      labels: LABELS,
    })}\n不中斷${opening.workerLabel}：v_食物 ≥ ${foodLock}（每 ${variation.time} 秒 ${variation.food} 食物）${goldLine}`
    formulation = formulation ? `${formulation}\n\n${text}` : text
  }

  function completeDue() {
    const due = tasks.filter((task) => task.doneAt <= time + 1e-6).sort((a, b) => a.doneAt - b.doneAt)
    if (!due.length) return
    tasks = tasks.filter((task) => task.doneAt > time + 1e-6)
    for (const task of due) {
      if (task.kind === 'build') {
        owned.push({ itemId: task.itemId, busyUntil: 0 })
        const item = index.byId.get(task.itemId)
        const builtVariation = item ? variationAt(item, age) ?? item.variations[0] : null
        if (builtVariation?.effects?.length) effects.push(...builtVariation.effects)
        const tags = item?.variations.flatMap((variation) => variation.tags) ?? []
        if (tags.includes('house')) popCap += POP_PER_HOUSE
        for (const tag of ['toAge2', 'toAge3', 'toAge4']) {
          if (tags.includes(tag)) {
            const next = Number(tag.slice(5))
            if (next > age) {
              age = next
              pushEvent(`完成 ${item?.name ?? task.itemId}，進入${ageName(age)}`)
              chainAge = age
              rememberLp(`${ageName(age)}之後的村民分配（${clock(time)}）`)
            }
          }
        }
        if (!tags.some((tag) => tag.startsWith('toAge'))) {
          pushEvent(`完成 ${item?.name ?? task.itemId}`)
          if (options.buildings.some((goal) => goal.id === task.itemId)) {
            rememberLp(`蓋完 ${item?.name ?? task.itemId} 之後的${opening.workerLabel}分配（${clock(time)}）`)
          }
        }
        if (blockadeAt < 0 && denialGoals().length > 0 && !denialLeft()) blockadeAt = time
        if (item?.id === 'cistern' && !cisternAura) {
          cisternAura = true
          for (const property of ['foodGatherRate', 'woodGatherRate', 'goldGatherRate', 'stoneGatherRate']) {
            effects.push({ property, effect: 'multiply', value: 1.1 })
          }
          pushEvent('蓄水池一級水：採集 +10%。多座不疊加，水渠升階沒有模擬。')
          rememberLp(`蓄水池之後的${opening.workerLabel}分配（${clock(time)}）`)
        }
      } else if (task.kind === 'train') {
        if (task.itemId === index.villager.id) {
          villagers += 1
          pushEvent(`${opening.workerLabel}訓練完成，現有 ${villagers} 人。${splitText()}`)
          if (source === 'farm' && villagers > farms) {
            const farm = index.farms[0]
            const farmCost = farm ? (variationAt(farm, age)?.wood ?? 0) : 0
            woodDebt += (villagers - farms) * farmCost
            farms = villagers
          }
        } else {
          doneUnits.set(task.itemId, (doneUnits.get(task.itemId) ?? 0) + 1)
          const item = index.byId.get(task.itemId)
          const variation = item ? variationAt(item, age) : null
          if (variation) armyValue += variation.food + variation.wood + variation.gold + variation.stone
          pushEvent(`訓練完成 ${item?.name ?? task.itemId}（${doneUnits.get(task.itemId)}）`)
        }
      } else if (task.kind === 'research') {
        const item = index.byId.get(task.itemId)
        const variation = item?.variations.find((row) => row.tags.includes(`toAge${age + 1}`))
          ?? (item ? variationAt(item, age) : null)
        if (variation?.effects) effects.push(...variation.effects)
        researched.add(task.itemId)
        const nextTag = variation?.tags.find((tag) => tag === `toAge${age + 1}`)
        if (nextTag) {
          age += 1
          chainAge = age
          pushEvent(`研究完成 ${item?.name ?? task.itemId}，進入${ageName(age)}`)
          rememberLp(`${ageName(age)}之後的村民分配（${clock(time)}）`)
        } else {
          pushEvent(`研究完成 ${item?.name ?? task.itemId}。${splitText()}`)
          rememberLp(`研究 ${item?.name ?? task.itemId} 之後的村民分配（${clock(time)}）`)
        }
      }
    }
  }

  function goalMet(): boolean {
    if (options.spam) return time >= scenario.horizon - 1e-6
    if (age < options.desiredAge) return false
    const structures = options.buildings.every((goal) => owned.filter((building) => building.itemId === goal.id).length >= goal.count)
    if (!structures) return false
    return options.goals.every((goal) => (doneUnits.get(goal.id) ?? 0) >= goal.count)
  }

  function startBuild(item: CatalogItem, builders: number, essential = false): boolean {
    if (item.id === 'town-center' && age < 2) return false
    const variation = variationAt(item, Math.max(age, item.minAge)) ?? item.variations[0]
    if (!variation) return false
    const cost = resOf(variation.food, variation.wood, variation.gold, variation.stone)
    const already = buildersBusy()
    const denial = denialGoals().some((goal) => goal.id === item.id)
    const cap = denial ? Math.max(1, villagers - 1) : maxBuilders()
    const allowed = Math.max(0, cap - already)
    if (!essential && allowed < 1) return false
    const free = villagers - already
    if (free < 1 && variation.time > 0) return false
    if (!keepsVillagersGoing(cost)) return false
    const used = Math.min(Math.max(1, builders), essential ? Math.max(1, allowed) : allowed, Math.max(1, free))
    pay(bank, cost)
    const landmark = item.variations.some((row) => row.tags.some((tag) => tag.startsWith('toAge')))
    const duration = variation.time <= 0 ? 0 : variation.time / Math.max(1, used) / buildPace(item.id, landmark, opening)
    tasks.push({
      kind: 'build',
      itemId: item.id,
      doneAt: time + duration,
      builders: variation.time <= 0 ? 0 : used,
      owner: -1,
      pop: 0,
    })
    pushEvent(`開始建造 ${item.name}（${used} 名${opening.workerLabel}，${Math.round(duration)} 秒）。${splitText()}`)
    if (item.variations.some((row) => row.tags.some((tag) => tag.startsWith('toAge')))) {
      chainAge = age + 1
    }
    return true
  }

  function freeBuilding(ids: string[]): Owned | null {
    return owned.find((building) => ids.includes(building.itemId) && building.busyUntil <= time + 1e-6) ?? null
  }

  function occupy(building: Owned, itemId: string, duration: number, kind: Task['kind'], pop: number) {
    building.busyUntil = time + duration
    tasks.push({ kind, itemId, doneAt: time + duration, builders: 0, owner: owned.indexOf(building), pop })
    popUsed += pop
  }

  function denialGoals() {
    return options.buildings.filter((goal) => {
      const item = index.byId.get(goal.id)
      return Boolean(item && item.id !== 'town-center' && item.minAge < options.desiredAge)
    })
  }

  function denialLeft(): boolean {
    return denialGoals().some((goal) => owned.filter((building) => building.itemId === goal.id).length < goal.count)
  }

  function tryAge(): boolean {
    if (age >= options.desiredAge) return false
    if (chainAge > age) return false
    if (denialLeft()) return false
    const goal = ageGoal(age + 1)
    if (!goal) {
      notes.push(`找不到進入${ageName(age + 1)}的官方升代項目。`)
      return false
    }
    if (goal.item.kind === 'building') {
      if (tasks.some((task) => task.itemId === goal.item.id) || owns(goal.item.id)) return false
      return startBuild(goal.item, policy.builders)
    }
    const producerId = goal.variation.producedBy.find((id) => owns(id))
      ?? goal.variation.producedBy[0]
    if (!producerId) return false
    if (!owns(producerId)) {
      const producer = index.byId.get(producerId)
      if (!producer) return false
      if (tasks.some((task) => task.itemId === producer.id)) return false
      return startBuild(producer, 1)
    }
    const building = freeBuilding([producerId])
    if (!building) return false
    const cost = resOf(goal.variation.food, goal.variation.wood, goal.variation.gold, goal.variation.stone)
    if (!keepsVillagersGoing(cost)) return false
    pay(bank, cost)
    const duration = goal.variation.time
    occupy(building, goal.item.id, duration, 'research', 0)
    chainAge = age + 1
    pushEvent(`開始研究 ${goal.item.name}（${Math.round(duration)} 秒）`)
    return true
  }

  function tryHouse(): boolean {
    const slots = popCap - popUsed
    const tight = slots <= 2 || (age >= options.desiredAge && slots < Math.min(20, armyPopLeft()))
    if (!tight) return false
    const house = cheapestHouse()
    if (!house) return false
    if (tasks.some((task) => task.itemId === house.id)) return false
    return startBuild(house, 1, true)
  }

  function tryProduction(): boolean {
    if (age < options.desiredAge) return false
    for (const goal of remainingGoals()) {
      const producer = regularProducer(index, goal.item, age)
      if (!producer || producer.minAge > age) continue
      const have = owned.filter((building) => building.itemId === producer.id).length
        + tasks.filter((task) => task.kind === 'build' && task.itemId === producer.id).length
      if (have >= policy.copies) continue
      if (startBuild(producer, 1)) return true
    }
    return false
  }

  function tryTrainUnit(): boolean {
    if (age < options.desiredAge && !options.spam) return false
    const goals = remainingGoals().sort((a, b) => b.left - a.left)
    for (const goal of goals) {
      if (goal.item.minAge > age) continue
      const variation = variationAt(goal.item, age)
      if (!variation) continue
      const building = freeBuilding(variation.producedBy)
      if (!building) continue
      const priced = costOf(variation, building.itemId, goal.item)
      const cost = resOf(priced.food, priced.wood, priced.gold, priced.stone)
      if (popUsed + priced.pop > popCap) continue
      if (!keepsVillagersGoing(cost)) continue
      pay(bank, cost)
      const duration = trainTime(goal.item, variation, priced.time)
      occupy(building, goal.item.id, duration, 'train', priced.pop)
      pushEvent(`開始訓練 ${goal.item.name}`)
      return true
    }
    return false
  }

  function ecoTargetsVillager(effect: Effect): boolean {
    if (effect.ids?.length) return effect.ids.includes('villager') || effect.ids.includes(index.villager.id)
    if (effect.classes?.length) {
      return effect.classes.some((group) => group.every((token) => token === 'villager' || token === 'worker'))
    }
    return false
  }

  function ecoRelevant(effect: Effect, need: Resources): boolean {
    if (!ecoTargetsVillager(effect)) return false
    if (effect.property === 'foodGatherRate') return true
    if (effect.property === 'berryGatherRate') return source === 'berry'
    if (effect.property === 'huntGatherRate') return source === 'deer' || source === 'boar'
    if (effect.property === 'woodGatherRate') return need.wood > 1
    if (effect.property === 'goldGatherRate') return need.gold > 1
    if (effect.property === 'stoneGatherRate') return need.stone > 1
    if (effect.property === 'carryCapacity' || effect.property === 'moveSpeed') return scenario.walk
    return false
  }

  function tryCistern(): boolean {
    if (!cisternWorth()) return false
    const item = index.byId.get('cistern')
    if (!item) return false
    return startBuild(item, 1)
  }

  function tryEco(): boolean {
    if (!policy.eco || chainAge > age) return false
    if (tryCistern()) return true
    const need = needBundle()
    const optionsHere: { item: CatalogItem; variation: Variation; effects: Effect[] }[] = []
    for (const item of index.byId.values()) {
      if (item.kind !== 'technology' || researched.has(item.id)) continue
      const variation = variationAt(item, age)
      if (!variation || variation.age > age) continue
      const relevant = (variation.effects ?? []).filter((effect) => ecoRelevant(effect, need))
      if (!relevant.length) continue
      optionsHere.push({ item, variation, effects: relevant })
    }
    optionsHere.sort((a, b) => a.variation.age - b.variation.age || totalRes(a.variation) - totalRes(b.variation))
    for (const candidate of optionsHere) {
      const producerId = candidate.variation.producedBy.find((id) => id !== index.tcId && index.byId.get(id)?.kind === 'building')
      if (!producerId) continue
      const producer = index.byId.get(producerId)
      if (!producer) continue
      const dropoffReady = owns(producer.id) || tasks.some((task) => task.kind === 'build' && task.itemId === producer.id)
      const dropoffVariation = variationAt(producer, age) ?? producer.variations[0]
      const cost = resOf(
        candidate.variation.food + (dropoffReady ? 0 : dropoffVariation.food),
        candidate.variation.wood + (dropoffReady ? 0 : dropoffVariation.wood),
        candidate.variation.gold + (dropoffReady ? 0 : dropoffVariation.gold),
        candidate.variation.stone + (dropoffReady ? 0 : dropoffVariation.stone),
      )
      const mult = candidate.effects.reduce((best, effect) => {
        if (effect.effect === 'multiply' && effect.value > 1) return Math.max(best, effect.value)
        if (effect.property === 'carryCapacity' || effect.property === 'moveSpeed') return Math.max(best, 1.08)
        return best
      }, 1)
      if (mult <= 1.001) continue
      const delay = timeUntil(bank, cost, assignment().income) + candidate.variation.time + (dropoffReady ? 0 : dropoffVariation.time)
      const horizon = Math.max(assignment().seconds, options.desiredAge >= 4 ? 800 : options.desiredAge === 3 ? 480 : options.goals.length ? 420 : 240)
      if (!(delay + horizon / mult < horizon - 1) || !Number.isFinite(delay)) continue
      if (!dropoffReady) {
        if (startBuild(producer, 1)) {
          pushEvent(`為了 ${candidate.item.name}，先蓋 ${producer.name}`)
          return true
        }
        continue
      }
      const building = freeBuilding([producer.id])
      if (!building) continue
      const researchCost = resOf(candidate.variation.food, candidate.variation.wood, candidate.variation.gold, candidate.variation.stone)
      if (!keepsVillagersGoing(researchCost)) continue
      pay(bank, researchCost)
      occupy(building, candidate.item.id, candidate.variation.time, 'research', 0)
      pushEvent(`開始研究 ${candidate.item.name}（提高村民效率，不佔用城鎮中心）`)
      return true
    }
    return false
  }

  function tryVillager(): boolean {
    if (villagers + workerQueued() >= index.workerCap) return false
    const variation = villagerNow()
    if (popUsed + variation.pop > popCap) return false
    const building = freeBuilding(variation.producedBy)
    if (!building) return false
    const cost = resOf(variation.food, variation.wood, variation.gold, variation.stone)
    if (!canAfford(bank, cost)) return false
    pay(bank, cost)
    occupy(building, index.villager.id, variation.time, 'train', variation.pop)
    return true
  }

  function tryStructure(): boolean {
    for (const goal of options.buildings) {
      const item = index.byId.get(goal.id)
      if (!item || item.minAge > age) continue
      if (item.id === 'town-center' && age < 2) continue
      if (structureProgress(goal.id) >= goal.count) continue
      if (startBuild(item, Math.max(1, policy.builders))) return true
    }
    return false
  }

  function tryActions(): boolean {
    if (source === 'farm' && !millPaid) {
      const mill = index.mills[0]
      const millWood = mill ? (variationAt(mill, age)?.wood ?? 50) : 0
      woodDebt += millWood
      millPaid = true
    }
    if (tryVillager()) return true
    if (tryHouse()) return true
    if (tryEco()) return true
    if (tryAge()) return true
    if (tryStructure()) return true
    if (tryProduction()) return true
    if (tryTrainUnit()) return true
    return false
  }

  function switchFood() {
    if (source === 'farm' || foodPool > 1e-4) return
    source = 'farm'
    const farm = index.farms[0]
    const farmWood = farm ? (variationAt(farm, age)?.wood ?? 0) : 0
    const mill = index.mills[0]
    if (!millPaid) {
      woodDebt += mill ? (variationAt(mill, age)?.wood ?? 0) : 0
      millPaid = true
    }
    const extra = Math.max(FARM_BASE, villagers)
    woodDebt += extra * farmWood
    farms = extra
    pushEvent(`${sourceLabel(catalog, scenario.foodSource)}耗盡，轉採農田（先支付磨坊與農田木材）`)
    notes.push('地圖食物耗盡後改用農田速率，並一次扣除磨坊與農田的木材。')
  }

  function advance(dt: number) {
    let left = dt
    while (left > 1e-6) {
      const step = Math.min(10, left)
      const plan = assignment()
      const income = plan.income
      let food = income.food * step
      if (source !== 'farm') {
        food = Math.min(food, Math.max(0, foodPool))
        foodPool -= food
      }
      bank.food += food
      let wood = income.wood * step
      if (woodDebt > 0) {
        const paid = Math.min(woodDebt, wood)
        woodDebt -= paid
        wood -= paid
      }
      bank.wood += wood
      bank.gold += income.gold * step
      bank.stone += income.stone * step
      time += step
      left -= step
      snapshot(plan.assign)
      if (source !== 'farm' && foodPool <= 1e-4) {
        switchFood()
        break
      }
    }
  }

  function nextDelay(): number {
    let dt = scenario.horizon - time
    for (const task of tasks) dt = Math.min(dt, task.doneAt - time)
    const plan = assignment()
    if (source !== 'farm' && plan.income.food > 1e-6 && foodPool > 0) {
      dt = Math.min(dt, foodPool / plan.income.food)
    }
    const preview = nextPurchase()
    if (preview) {
      const wait = timeUntil(bank, preview, plan.income)
      if (wait > 1e-3 && Number.isFinite(wait)) dt = Math.min(dt, wait)
    }
    return dt
  }

  function withVillagerFood(cost: Resources): Resources {
    const variation = villagerNow()
    if (villagerQueuedTask()) return cost
    return resOf(cost.food + variation.food, cost.wood, cost.gold, cost.stone)
  }

  function nextPurchase(): Resources | null {
    const variation = villagerNow()
    if (villagers + workerQueued() < index.workerCap && popUsed + variation.pop <= popCap && !villagerQueuedTask()) {
      return resOf(variation.food, variation.wood, variation.gold, variation.stone)
    }
    const house = cheapestHouse()
    if (house && popCap - popUsed <= 2) {
      const houseVariation = variationAt(house, age) ?? house.variations[0]
      return resOf(houseVariation.food, houseVariation.wood, houseVariation.gold, houseVariation.stone)
    }
    if (age < options.desiredAge && chainAge <= age && !denialLeft()) {
      const goal = ageGoal(age + 1)
      if (goal) {
        if (goal.item.kind === 'building') return withVillagerFood(resOf(goal.variation.food, goal.variation.wood, goal.variation.gold, goal.variation.stone))
        const producerId = goal.variation.producedBy.find((id) => !owns(id) && id !== index.tcId)
        if (producerId) {
          const producer = index.byId.get(producerId)
          const producerVariation = producer?.variations[0]
          if (producerVariation) return withVillagerFood(resOf(producerVariation.food, producerVariation.wood, producerVariation.gold, producerVariation.stone))
        }
        return withVillagerFood(resOf(goal.variation.food, goal.variation.wood, goal.variation.gold, goal.variation.stone))
      }
    }
    for (const goal of options.buildings) {
      const item = index.byId.get(goal.id)
      if (!item || item.minAge > age) continue
      if (structureProgress(goal.id) >= goal.count) continue
      const variation = variationAt(item, Math.max(age, item.minAge)) ?? item.variations[0]
      return resOf(variation.food, variation.wood, variation.gold, variation.stone)
    }
    const goal = remainingGoals()[0]
    if (goal && age >= goal.item.minAge) {
      const variation = variationAt(goal.item, age)
      if (variation) return resOf(variation.food, variation.wood, variation.gold, variation.stone)
    }
    return null
  }

  if (source === 'farm') switchFood()
  snapshot(assignment().assign)
  rememberLp('開局村民分配')
  let guard = 0
  while (time < scenario.horizon - 1e-6 && !goalMet() && guard < 8000) {
    guard += 1
    completeDue()
    if (goalMet()) break
    let spins = 0
    while (tryActions() && spins < 30) spins += 1
    if (goalMet()) break
    const dt = nextDelay()
    if (!(dt > 1e-3) || !Number.isFinite(dt)) break
    advance(Math.min(dt, scenario.horizon - time))
  }
  completeDue()
  snapshot(assignment().assign)
  met = goalMet() || (options.spam && time >= scenario.horizon - 1)
  const objective = options.spam ? armyValue : time
  const landmarkNames = [2, 3, 4]
    .filter((target) => target <= options.desiredAge && policy.landmark[target])
    .map((target) => index.byId.get(policy.landmark[target] as string)?.name ?? policy.landmark[target])
    .join(' → ')
  const structureText = options.buildings
    .map((goal) => `${index.byId.get(goal.id)?.name ?? goal.id} ×${goal.count}`)
    .join('、')
  const builtNote = structureText ? `建築：${structureText}，同時建造 ${policy.builders} 人。` : ''
  return {
    feasible: met,
    objective,
    objectiveLabel: options.spam ? `${Math.round(armyValue)} 資源值` : clock(time),
    summary: options.spam
      ? `${clock(scenario.horizon)} 時軍隊累積資源值 ${Math.round(armyValue)}。升代：${landmarkNames || '不升代'}。`
      : met
        ? `${blockadeAt >= 0 ? `封鎖完成 ${clock(blockadeAt)}，` : ''}${clock(time)} 達成目標。村民 ${villagers}，時代 ${age}。${landmarkNames ? `路線：${landmarkNames}。` : ''}${builtNote}`
        : `${clock(time)} 仍未達成。停在${ageName(age)}、村民 ${villagers}。${builtNote}`,
    formulation,
    timeline,
    events,
    notes,
    tried: 1,
    policy,
    age,
    villagers,
    armyValue,
  }
}

function ageName(age: number): string {
  return ['', '黑暗時代', '封建時代', '城堡時代', '帝王時代'][age] ?? `時代 ${age}`
}

function uniqLandmarks(index: CivIndex, age: number, prefer: string[], limit: number) {
  const rows = index.ageUps[age] ?? []
  const picked: string[] = []
  for (const id of prefer) {
    if (rows.some((row) => row.item.id === id) && !picked.includes(id)) picked.push(id)
  }
  for (const row of rows) {
    if (picked.length >= limit) break
    if (!picked.includes(row.item.id)) picked.push(row.item.id)
  }
  return picked.length ? picked : ['']
}

function policiesFor(scenario: Scenario, index: CivIndex, options: RunOptions): Policy[] {
  const prefer = options.goals.flatMap((goal) => {
    const item = index.byId.get(goal.id)
    return item ? variationAt(item, 4)?.producedBy ?? [] : []
  })
  if (options.spam && scenario.units[0]) {
    const item = index.byId.get(scenario.units[0].id)
    if (item) prefer.push(...(variationAt(item, 4)?.producedBy ?? []))
  }
  const policies: Policy[] = []
  const base = {
    villsBefore: [0, 130, 130, 130],
    finalVills: 130,
    landmark: {} as Policy['landmark'],
    spamUnit: policySpam(scenario, options),
  }
  const ecoChoices = [false, true]

  if (options.desiredAge <= 1) {
    const builderChoices = options.buildings.length || options.goals.length ? [1, 2, 4] : [1]
    const copyChoices = options.goals.length ? [1, 2] : [1]
    for (const builders of builderChoices) {
      for (const copies of copyChoices) {
        for (const eco of ecoChoices) {
          policies.push({ ...base, builders, copies, eco })
        }
      }
    }
    return policies
  }

  const landmarks2 = uniqLandmarks(index, 2, prefer, options.desiredAge === 2 ? 4 : 2)
  const landmarks3 = options.desiredAge >= 3 ? uniqLandmarks(index, 3, prefer, 2) : ['']
  const landmarks4 = options.desiredAge >= 4 ? uniqLandmarks(index, 4, prefer, 1) : ['']
  const builderChoices = [2, 4, 6]
  const copyChoices = options.goals.length || options.spam ? [1, 2] : [1]
  for (const l2 of landmarks2) {
    for (const builders of builderChoices) {
      for (const l3 of landmarks3) {
        for (const l4 of landmarks4) {
          for (const copies of copyChoices) {
            for (const eco of ecoChoices) {
              policies.push({
                ...base,
                builders,
                copies,
                eco,
                landmark: {
                  ...(l2 ? { 2: l2 } : {}),
                  ...(l3 ? { 3: l3 } : {}),
                  ...(l4 ? { 4: l4 } : {}),
                },
              })
            }
          }
        }
      }
    }
  }
  return policies
}

function policySpam(scenario: Scenario, options: RunOptions): string | undefined {
  if (!options.spam) return undefined
  return scenario.units[0]?.id
}

function better(mode: Scenario['mode'], candidate: SolveResult, best: SolveResult | null): boolean {
  if (!candidate.feasible) return false
  if (!best?.feasible) return true
  if (mode === 'value') return candidate.armyValue > best.armyValue
  return candidate.objective < best.objective
}

function requiredAge(index: CivIndex, scenario: Scenario): number {
  if (scenario.mode === 'age') return scenario.targetAge
  if (scenario.mode === 'value') {
    const item = scenario.units[0] ? index.byId.get(scenario.units[0].id) : null
    return Math.max(1, item?.minAge ?? 2)
  }
  let age = 1
  for (const goal of scenario.units) {
    const item = index.byId.get(goal.id)
    if (!item) continue
    age = Math.max(age, item.minAge)
    const producer = regularProducer(index, item, item.minAge)
    if (producer) age = Math.max(age, producer.minAge)
  }
  return age
}

export function optimize(catalog: Catalog, scenario: Scenario): SolveResult {
  if (scenario.mode === 'income') return solveIncome(catalog, scenario)
  const index = indexCiv(catalog, scenario.civ)
  if (!index) return emptyResult(['這個文明沒有完整的村民與建築資料。'])
  const spam = scenario.mode === 'value'
  const desiredAge = requiredAge(index, scenario)
  const goals = spam ? [] : scenario.units.filter((unit) => unit.count > 0)
  const buildings = spam ? [] : scenario.buildings.filter((goal) => goal.count > 0)
  const options: RunOptions = { desiredAge, goals, buildings, spam }
  let policies = policiesFor(scenario, index, options)
  if (policies.length > 240) policies = policies.filter((_, i) => i % Math.ceil(policies.length / 240) === 0)
  let best: SolveResult | null = null
  let closest: SolveResult | null = null
  for (const policy of policies) {
    const result = runPolicy(catalog, scenario, index, policy, options)
    if (!closest || result.age > closest.age || (result.age === closest.age && result.armyValue > closest.armyValue)) {
      closest = result
    }
    if (better(scenario.mode, result, best)) best = result
  }
  const chosen = best ?? closest ?? emptyResult(['沒有可模擬的策略。'])
  chosen.tried = policies.length
  if (!chosen.formulation) chosen.formulation = '這個情境沒有留下線性式。'
  chosen.notes = [
    ...chosen.notes,
    openingFor(scenario.civ).detail,
    `前提是城鎮中心不中斷${openingFor(scenario.civ).workerLabel}：付得起就立刻排下一個，花資源時留下下一個的食物和黃金，並留夠人採這些資源。`,
    '會提高工人採集、負重或移速的科技，只在回本且研究建築不是城鎮中心時才研究；推車只在有計算往返時改變產量。',
    '沒有寫進開局說明的機制不會進線性式。那種結果只是這個模型裡的最佳解，不是實戰最佳解。',
  ]
  return chosen
}

export function defaultUnit(catalog: Catalog, abbr: string): string | null {
  const index = indexCiv(catalog, abbr)
  if (!index) return null
  const longbow = index.byId.get('longbowman')
  if (longbow?.military) return longbow.id
  const ranked = [...index.military].sort((a, b) => a.minAge - b.minAge || a.name.localeCompare(b.name))
  return ranked[0]?.id ?? null
}

export function militaryUnits(catalog: Catalog, abbr: string): CatalogItem[] {
  return indexCiv(catalog, abbr)?.military ?? []
}

export { indexCiv }
