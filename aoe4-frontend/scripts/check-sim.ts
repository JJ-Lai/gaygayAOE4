import { readFileSync } from 'node:fs'
import { optimize } from '../src/sim/engine.ts'
import { openingFor } from '../src/sim/openings.ts'
import { scenariosFor } from '../src/sim/scenarios.ts'
import type { Catalog, Scenario } from '../src/sim/types.ts'

const catalog = JSON.parse(readFileSync(new URL('../public/sim/catalog.json', import.meta.url), 'utf8')) as Catalog

function scenario(patch: Partial<Scenario>): Scenario {
  const opening = openingFor(patch.civ ?? 'en')
  return {
    mode: 'age',
    civ: 'en',
    targetAge: 2,
    units: [],
    buildings: [],
    horizon: 1200,
    foodSource: 'sheep',
    foodAmount: 2000,
    walk: false,
    dropoffTiles: 0,
    gatherMultiplier: 1,
    startFood: opening.food,
    startWood: opening.wood,
    startGold: opening.gold,
    startStone: opening.stone,
    startVillagers: opening.villagers,
    incomePerMin: { food: 45, wood: 0, gold: 0, stone: 0 },
    incomeVillagers: 10,
    incomeMode: 'min-villagers',
    incomeWeights: { food: 1, wood: 1, gold: 1, stone: 1 },
    ...patch,
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

let missing = 0
for (const civ of catalog.civilizations) {
  const items = catalog.items[civ.abbr] ?? []
  const villager = items.find((item) => item.variations.some((variation) => variation.tags.includes('villager')))
  const ageUp = items.some((item) => item.variations.some((variation) => variation.tags.includes('toAge2')))
  if (!villager || !ageUp) {
    missing += 1
    console.log('missing', civ.abbr, Boolean(villager), ageUp)
  }
}
assert(catalog.civilizations.length >= 25, 'civ count')
assert(missing === 0, 'every civ needs a villager and a feudal age-up')

const income = optimize(catalog, scenario({ mode: 'income' }))
assert(Math.abs(income.villagers - 1) < 0.02, `income villagers ${income.villagers}`)

const feudal = optimize(catalog, scenario({ mode: 'age', targetAge: 2 }))
console.log('english feudal', feudal.objectiveLabel, 'tried', feudal.tried, 'feasible', feudal.feasible)
console.log(feudal.summary)
console.log(feudal.events.slice(0, 12).map((event) => `${Math.round(event.t)} ${event.text}`).join('\n'))
assert(feudal.feasible, 'english feudal infeasible')
assert(feudal.objective > 120 && feudal.objective < 900, `feudal time ${feudal.objective}`)
assert(feudal.villagers >= 12, `feudal should keep training villagers, got ${feudal.villagers}`)
const villTimes = feudal.events.filter((event) => event.text.includes('村民訓練完成')).map((event) => event.t)
let worstGap = 0
for (let index = 1; index < villTimes.length; index += 1) worstGap = Math.max(worstGap, villTimes[index] - villTimes[index - 1])
console.log('villager completions', villTimes.length, 'worst gap', worstGap)
assert(villTimes.length >= 6, 'villager production stopped too early')
assert(worstGap <= 30, `villager production gap ${worstGap}`)

const longbows = optimize(catalog, scenario({
  mode: 'army',
  units: [{ id: 'longbowman', count: 8 }],
  horizon: 1500,
}))
console.log('longbows', longbows.objectiveLabel, 'tried', longbows.tried, longbows.summary)
assert(longbows.feasible, 'longbow timing infeasible')
assert(longbows.objective > feudal.objective, 'army should finish after feudal')

const abbasid = optimize(catalog, scenario({ mode: 'age', civ: 'ab', targetAge: 2 }))
console.log('abbasid', abbasid.objectiveLabel, abbasid.summary)
assert(abbasid.feasible, 'abbasid feudal infeasible')

const englishScenarios = scenariosFor(catalog, 'en')
const frenchScenarios = scenariosFor(catalog, 'fr')
const rusScenarios = scenariosFor(catalog, 'ru')
const jinScenarios = scenariosFor(catalog, 'jin')
assert(englishScenarios.some((item) => item.id === 'second-tc' && item.targetAge === 2), 'english second tc waits for feudal')
assert(!englishScenarios.some((item) => item.label.includes('黑暗時代') && item.id === 'second-tc'), 'no dark-age town center scenario')
assert(englishScenarios.some((item) => item.id === 'towers'), 'english towers')
assert(catalog.items.en.some((item) => item.id === 'man-at-arms' && item.minAge <= 1), 'english has dark-age man-at-arms')
assert(englishScenarios.some((item) => item.id === 'dark-rush' && item.targetAge === 2 && item.units.length === 0), 'tower rush ages up after the towers')
assert(!englishScenarios.some((item) => item.units.some((unit) => unit.id === 'spearman')), 'english spears are not a dark-age scenario')
assert(frenchScenarios.some((item) => item.units.some((unit) => unit.id === 'royal-knight')), 'french royal knight')
assert(!frenchScenarios.some((item) => item.units.some((unit) => unit.id === 'longbowman')), 'french has no longbow scenario')
assert(!rusScenarios.some((item) => item.id === 'towers' || item.id === 'dark-rush'), 'rus has no dark-age outpost scenario')
const jinTc = jinScenarios.find((item) => item.id === 'second-tc')
assert(jinTc?.targetAge === 2, 'jin second tc waits for feudal')
assert(englishScenarios.map((item) => item.label).join('|') !== frenchScenarios.map((item) => item.label).join('|'), 'scenario labels follow the civ')

const secondTc = optimize(catalog, scenario({
  mode: 'age',
  targetAge: 2,
  buildings: [{ id: 'town-center', count: 1 }],
  horizon: 1800,
}))
console.log('second tc', secondTc.objectiveLabel, 'tried', secondTc.tried, secondTc.summary)
assert(secondTc.feasible, 'second tc infeasible')
const tcEvent = secondTc.events.find((event) => event.text.includes('Town Center') || event.text.includes('城鎮中心'))
const aged = secondTc.events.find((event) => event.text.includes('封建'))
assert(aged && tcEvent && aged.t <= tcEvent.t, 'town center started before feudal')

const towers = optimize(catalog, scenario({
  mode: 'age',
  targetAge: 2,
  buildings: [{ id: 'outpost', count: 3 }],
  horizon: 1800,
}))
console.log('towers', towers.objectiveLabel, 'tried', towers.tried, towers.summary)
assert(towers.feasible, 'towers infeasible')
assert(towers.age >= 2, 'towers should reach feudal')
const towerDone = towers.events.filter((event) => event.text.startsWith('完成 Outpost')).map((event) => event.t)
const towerFeudal = towers.events.find((event) => event.text.includes('封建'))
assert(towerDone.length >= 3 && towerFeudal && Math.max(...towerDone) <= towerFeudal.t, 'outposts must finish before feudal')

const rush = optimize(catalog, scenario({
  mode: 'age',
  targetAge: 2,
  buildings: [{ id: 'outpost', count: 2 }],
  horizon: 1800,
}))
console.log('dark rush', rush.objectiveLabel, 'tried', rush.tried, rush.summary)
assert(rush.feasible, 'dark rush infeasible')
assert(rush.age >= 2, 'dark rush should reach feudal')
const rushTowers = rush.events.filter((event) => event.text.startsWith('完成 Outpost')).map((event) => event.t)
const rushFeudal = rush.events.find((event) => event.text.includes('封建'))
assert(rushTowers.length >= 2 && rushFeudal && Math.max(...rushTowers) <= rushFeudal.t, 'rush towers before feudal')

assert(openingFor('by').stone === 100, 'byzantine stone')
const byzantine = optimize(catalog, scenario({ mode: 'age', civ: 'by', targetAge: 2, horizon: 1200 }))
console.log('byzantine', byzantine.objectiveLabel, byzantine.summary)
console.log(byzantine.events.slice(0, 6).map((event) => `${Math.round(event.t)} ${event.text}`).join('\n'))
assert(byzantine.feasible, 'byzantine feudal infeasible')
assert(byzantine.events.some((event) => event.text.includes('蓄水池一級水')), 'cistern aura missing')
const aura = byzantine.formulation.includes('0.825')
assert(aura, 'cistern should raise sheep rate to 0.825')
assert(openingFor('jin').villagers === 3 && openingFor('jin').workerId === 'mounted-villager', 'jin opening')
const jin = optimize(catalog, scenario({ mode: 'age', civ: 'jin', targetAge: 2, horizon: 1500 }))
console.log('jin', jin.objectiveLabel, jin.summary)
console.log(jin.events.slice(0, 8).map((event) => `${Math.round(event.t)} ${event.text}`).join('\n'))
assert(jin.feasible, 'jin feudal infeasible')
assert(jin.events.some((event) => event.text.includes('鄉騎訓練完成')), 'jin should train mounted villagers')
assert(!jin.events.some((event) => event.text.includes('村民訓練完成')), 'jin should not train regular villagers')

console.log('ok')
