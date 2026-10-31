import type { AnalyticsFilters } from '../api/types'

function buildExportParams(profileId: number, filters?: AnalyticsFilters) {
  const params = new URLSearchParams({ profileId: String(profileId) })
  if (filters?.civ) params.set('civ', filters.civ)
  if (filters?.opponentCiv) params.set('opponentCiv', filters.opponentCiv)
  if (filters?.leaderboard) params.set('leaderboard', filters.leaderboard)
  if (filters?.patch != null) params.set('patch', String(filters.patch))
  if (filters?.ratingMin != null) params.set('ratingMin', String(filters.ratingMin))
  if (filters?.ratingMax != null) params.set('ratingMax', String(filters.ratingMax))
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters?.dateTo) params.set('dateTo', filters.dateTo)
  return params
}

export function getMatchupExportUrl(profileId: number, filters?: AnalyticsFilters) {
  const params = buildExportParams(profileId, filters)
  return `/api/v1/export/matchup-matrix.csv?${params.toString()}`
}

export function getMatchupExportJsonUrl(profileId: number, filters?: AnalyticsFilters) {
  const params = buildExportParams(profileId, filters)
  return `/api/v1/export/matchup-matrix.json?${params.toString()}`
}

export function getMapStatsExportUrl(profileId: number, filters?: AnalyticsFilters) {
  const params = buildExportParams(profileId, filters)
  return `/api/v1/export/map-stats.csv?${params.toString()}`
}

export function getMapStatsExportJsonUrl(profileId: number, filters?: AnalyticsFilters) {
  const params = buildExportParams(profileId, filters)
  return `/api/v1/export/map-stats.json?${params.toString()}`
}

export function getPatchStatsExportUrl(profileId: number, filters?: AnalyticsFilters) {
  const params = buildExportParams(profileId, filters)
  return `/api/v1/export/patch-stats.csv?${params.toString()}`
}

export function getPatchStatsExportJsonUrl(profileId: number, filters?: AnalyticsFilters) {
  const params = buildExportParams(profileId, filters)
  return `/api/v1/export/patch-stats.json?${params.toString()}`
}

export function getCombatStatsExportUrl(profileId: number, filters?: AnalyticsFilters) {
  const params = buildExportParams(profileId, filters)
  return `/api/v1/export/combat-stats.csv?${params.toString()}`
}

export function getCombatStatsExportJsonUrl(profileId: number, filters?: AnalyticsFilters) {
  const params = buildExportParams(profileId, filters)
  return `/api/v1/export/combat-stats.json?${params.toString()}`
}

export function getUnitLossStatsExportUrl(profileId: number, filters?: AnalyticsFilters) {
  const params = buildExportParams(profileId, filters)
  return `/api/v1/export/unit-loss-stats.csv?${params.toString()}`
}

export function getUnitLossStatsExportJsonUrl(profileId: number, filters?: AnalyticsFilters) {
  const params = buildExportParams(profileId, filters)
  return `/api/v1/export/unit-loss-stats.json?${params.toString()}`
}

export function getGamesExportUrl(profileId: number) {
  return `/api/v1/export/games.csv?profileId=${profileId}`
}

export function downloadUrl(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}
