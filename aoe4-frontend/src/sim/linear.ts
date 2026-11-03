import type { Resources } from './types.ts'

export const ZERO: Resources = { food: 0, wood: 0, gold: 0, stone: 0 }

export function resOf(food: number, wood: number, gold: number, stone: number): Resources {
  return { food, wood, gold, stone }
}

export function totalRes(value: Resources): number {
  return value.food + value.wood + value.gold + value.stone
}

export function canAfford(bank: Resources, cost: Resources): boolean {
  return bank.food >= cost.food - 1e-4
    && bank.wood >= cost.wood - 1e-4
    && bank.gold >= cost.gold - 1e-4
    && bank.stone >= cost.stone - 1e-4
}

export function pay(bank: Resources, cost: Resources) {
  bank.food -= cost.food
  bank.wood -= cost.wood
  bank.gold -= cost.gold
  bank.stone -= cost.stone
}

/**
 * Optimal villager split for a fixed workforce.
 * Minimizes time T to cover `need` when each resource has a constant gather rate.
 *
 *   min T
 *   s.t. assign_r * rate_r * T >= need_r
 *        sum assign_r = villagers
 *        assign_r >= 0
 */
export function allocate(villagers: number, need: Resources, rates: Resources): {
  assign: Resources
  income: Resources
  seconds: number
} {
  const assign = { ...ZERO }
  const income = { ...ZERO }
  if (villagers <= 0) return { assign, income, seconds: Number.POSITIVE_INFINITY }

  const keys = ['food', 'wood', 'gold', 'stone'] as const
  let weight = 0
  const weights = { ...ZERO }
  for (const key of keys) {
    if (need[key] > 1e-6 && rates[key] > 1e-8) {
      weights[key] = need[key] / rates[key]
      weight += weights[key]
    }
  }

  if (weight <= 0) {
    assign.food = villagers
    income.food = villagers * rates.food
    return { assign, income, seconds: 0 }
  }

  let seconds = 0
  for (const key of keys) {
    assign[key] = villagers * (weights[key] / weight)
    income[key] = assign[key] * rates[key]
    if (need[key] > 1e-6 && income[key] > 1e-8) {
      seconds = Math.max(seconds, need[key] / income[key])
    }
  }
  return { assign, income, seconds }
}

/** Same objective as allocate, but every resource gets a whole number of villagers. */
export function allocateInteger(villagers: number, need: Resources, rates: Resources): {
  assign: Resources
  income: Resources
  seconds: number
} {
  const count = Math.max(0, Math.floor(villagers + 1e-9))
  const assign = { ...ZERO }
  const income = { ...ZERO }
  const keys = ['food', 'wood', 'gold', 'stone'] as const
  const active = keys.filter((key) => need[key] > 1e-6 && rates[key] > 1e-8)
  if (count === 0) return { assign, income, seconds: active.length ? Number.POSITIVE_INFINITY : 0 }
  if (!active.length) {
    assign.food = count
    income.food = count * rates.food
    return { assign, income, seconds: 0 }
  }
  const finish = (key: typeof keys[number]) => assign[key] === 0
    ? Number.POSITIVE_INFINITY
    : need[key] / (rates[key] * assign[key])
  for (let placed = 0; placed < count; placed += 1) {
    let best = active[0]
    for (const key of active) {
      const time = finish(key)
      const bestTime = finish(best)
      const later = time > bestTime + 1e-6
      const tie = Math.abs(time - bestTime) <= 1e-6 || (time === Number.POSITIVE_INFINITY && bestTime === Number.POSITIVE_INFINITY)
      if (later || (tie && need[key] / rates[key] > need[best] / rates[best])) best = key
    }
    assign[best] += 1
  }
  let seconds = 0
  for (const key of keys) {
    income[key] = assign[key] * rates[key]
    if (need[key] <= 1e-6) continue
    if (income[key] <= 1e-8) seconds = Number.POSITIVE_INFINITY
    else seconds = Math.max(seconds, need[key] / income[key])
  }
  return { assign, income, seconds }
}

export function timeUntil(bank: Resources, cost: Resources, income: Resources): number {
  const keys = ['food', 'wood', 'gold', 'stone'] as const
  let wait = 0
  for (const key of keys) {
    const deficit = cost[key] - bank[key]
    if (deficit <= 1e-4) continue
    if (income[key] <= 1e-8) return Number.POSITIVE_INFINITY
    wait = Math.max(wait, deficit / income[key])
  }
  return wait
}

export function formatLp(options: {
  title: string
  villagers: number | null
  need: Resources
  rates: Resources
  assign: Resources
  seconds: number
  labels: Record<string, string>
}): string {
  const keys = ['food', 'wood', 'gold', 'stone'] as const
  const lines = [
    options.title,
    options.villagers == null
      ? '最小化  v_食物 + v_木材 + v_黃金 + v_石頭'
      : `最小化  T    （村民總數固定為 ${Math.round(options.villagers)}）`,
    '條件',
  ]
  for (const key of keys) {
    const label = options.labels[key]
    if (options.need[key] <= 0 && options.assign[key] <= 0) continue
    lines.push(
      `  ${options.rates[key].toFixed(3)} · v_${label} · T  ≥  ${options.need[key].toFixed(1)}`,
    )
  }
  lines.push('  v_食物 + v_木材 + v_黃金 + v_石頭  =  村民總數')
  lines.push('  v ≥ 0 且為整數')
  lines.push('解')
  for (const key of keys) {
    if (options.assign[key] <= 0.001 && options.need[key] <= 0) continue
    lines.push(`  v_${options.labels[key]} = ${Math.round(options.assign[key])}`)
  }
  if (Number.isFinite(options.seconds)) {
    lines.push(`  T = ${options.seconds.toFixed(1)} 秒`)
  }
  return lines.join('\n')
}
