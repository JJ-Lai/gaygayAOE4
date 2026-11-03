import type { Catalog } from './types.ts'

let cached: Catalog | null = null

export async function loadCatalog(): Promise<Catalog> {
  if (cached) return cached
  const response = await fetch('/sim/catalog.json')
  if (!response.ok) throw new Error('無法載入文明參數')
  cached = (await response.json()) as Catalog
  return cached
}
