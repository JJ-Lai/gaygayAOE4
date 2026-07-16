import axios from 'axios'
import type {
  AnalyticsFilters,
  BuildPreferencesView,
  GameDetailView,
  GamePageView,
  GameTimelineView,
  MatchupMatrixView,
  MapStatsView,
  MetaFiltersView,
  ModeStatsView,
  CombatStatsView,
  UnitLossStatsView,
  FailedSummariesView,
  PlayerSyncStatusBatchView,
  BatchSyncResultView,
  RetryFailedResultView,
  ReparseSummariesResultView,
  AlertNotifyResultView,
  QueryPlanReportView,
  SyncOverviewView,
  PatchStatsView,
  MilitaryLossRatioView,
  PlayerOverviewView,
  PlayerSearchResultView,
  PlayerSyncStatusView,
  PlayerView,
  ResourceTimelineView,
  SummaryApiKeyStatusView,
  SummarySyncResultView,
  SyncResultView,
} from './types'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? ''

const http = axios.create({
  baseURL,
  timeout: 60000,
})

function buildParams(filters?: AnalyticsFilters) {
  if (!filters) return {}
  const params: Record<string, string | number> = {}
  if (filters.civ) params.civ = filters.civ
  if (filters.opponentCiv) params.opponentCiv = filters.opponentCiv
  if (filters.leaderboard) params.leaderboard = filters.leaderboard
  if (filters.patch != null) params.patch = filters.patch
  if (filters.ratingMin != null) params.ratingMin = filters.ratingMin
  if (filters.ratingMax != null) params.ratingMax = filters.ratingMax
  if (filters.resources?.length) params.resources = filters.resources.join(',')
  if (filters.minuteFrom != null) params.minuteFrom = filters.minuteFrom
  if (filters.minuteTo != null) params.minuteTo = filters.minuteTo
  if (filters.dateFrom) params.dateFrom = filters.dateFrom
  if (filters.dateTo) params.dateTo = filters.dateTo
  return params
}

export async function getPlayer(profileId: number): Promise<PlayerView> {
  const { data } = await http.get<PlayerView>(`/api/v1/players/${profileId}`)
  return data
}

export async function searchPlayers(query: string, limit = 10): Promise<PlayerSearchResultView> {
  const { data } = await http.get<PlayerSearchResultView>(`/api/v1/players/search`, {
    params: { query, limit },
  })
  return data
}

export async function syncPlayer(profileId: number): Promise<SyncResultView> {
  const { data } = await http.post<SyncResultView>(`/api/v1/players/${profileId}/sync`)
  return data
}

export async function getSyncStatus(profileId: number): Promise<PlayerSyncStatusView> {
  const { data } = await http.get<PlayerSyncStatusView>(`/api/v1/players/${profileId}/sync-status`)
  return data
}

export async function getOverview(profileId: number, filters?: AnalyticsFilters): Promise<PlayerOverviewView> {
  const { data } = await http.get<PlayerOverviewView>(`/api/v1/analytics/overview`, {
    params: { profileId, ...buildParams(filters) },
  })
  return data
}

export async function getResourceTimeline(profileId: number, filters?: AnalyticsFilters): Promise<ResourceTimelineView> {
  const { data } = await http.get<ResourceTimelineView>(`/api/v1/analytics/resource-timeline`, {
    params: { profileId, ...buildParams(filters) },
  })
  return data
}

export async function getMatchupMatrix(profileId: number, filters?: AnalyticsFilters): Promise<MatchupMatrixView> {
  const { data } = await http.get<MatchupMatrixView>(`/api/v1/analytics/matchup-matrix`, {
    params: { profileId, ...buildParams(filters) },
  })
  return data
}

export async function getMapStats(profileId: number, filters?: AnalyticsFilters): Promise<MapStatsView> {
  const { data } = await http.get<MapStatsView>(`/api/v1/analytics/map-stats`, {
    params: { profileId, ...buildParams(filters) },
  })
  return data
}

export async function getPatchStats(profileId: number, filters?: AnalyticsFilters): Promise<PatchStatsView> {
  const { data } = await http.get<PatchStatsView>(`/api/v1/analytics/patch-stats`, {
    params: { profileId, ...buildParams(filters) },
  })
  return data
}

export async function getModeStats(profileId: number, filters?: AnalyticsFilters): Promise<ModeStatsView> {
  const { data } = await http.get<ModeStatsView>(`/api/v1/analytics/mode-stats`, {
    params: { profileId, ...buildParams(filters) },
  })
  return data
}

export async function getCombatStats(profileId: number, filters?: AnalyticsFilters): Promise<CombatStatsView> {
  const { data } = await http.get<CombatStatsView>(`/api/v1/analytics/combat-stats`, {
    params: { profileId, ...buildParams(filters) },
  })
  return data
}

export async function getUnitLossStats(profileId: number, filters?: AnalyticsFilters): Promise<UnitLossStatsView> {
  const { data } = await http.get<UnitLossStatsView>(`/api/v1/analytics/unit-loss-stats`, {
    params: { profileId, ...buildParams(filters) },
  })
  return data
}

export async function getSyncOverview(): Promise<SyncOverviewView> {
  const { data } = await http.get<SyncOverviewView>(`/api/v1/ops/sync-overview`)
  return data
}

export async function getFailedSummaries(limit = 20): Promise<FailedSummariesView> {
  const { data } = await http.get<FailedSummariesView>(`/api/v1/ops/failed-summaries`, {
    params: { limit },
  })
  return data
}

export async function getQueryPlans(profileId: number): Promise<QueryPlanReportView> {
  const { data } = await http.get<QueryPlanReportView>(`/api/v1/ops/query-plans`, {
    params: { profileId },
  })
  return data
}

export async function getBatchSyncStatus(profileIds: number[]): Promise<PlayerSyncStatusBatchView> {
  const { data } = await http.get<PlayerSyncStatusBatchView>(`/api/v1/ops/players/sync-status`, {
    params: { profileIds: profileIds.join(',') },
  })
  return data
}

export async function batchSyncPlayers(profileIds: number[]): Promise<BatchSyncResultView> {
  const { data } = await http.post<BatchSyncResultView>(`/api/v1/ops/batch-sync`, null, {
    params: { profileIds: profileIds.join(',') },
  })
  return data
}

export async function retryFailedSummaries(profileId?: number, maxGames = 20): Promise<RetryFailedResultView> {
  const { data } = await http.post<RetryFailedResultView>(`/api/v1/ops/retry-failed-summaries`, null, {
    params: { profileId, maxGames },
  })
  return data
}

export async function notifyAlerts(force = false): Promise<AlertNotifyResultView> {
  const { data } = await http.post<AlertNotifyResultView>(`/api/v1/ops/notify-alerts`, null, {
    params: { force },
  })
  return data
}

export async function reparseSummaries(profileId?: number, maxGames = 20): Promise<ReparseSummariesResultView> {
  const { data } = await http.post<ReparseSummariesResultView>(`/api/v1/ops/reparse-summaries`, null, {
    params: { profileId, maxGames },
  })
  return data
}

export async function getMilitaryLossRatio(
  profileId: number,
  playerCiv: string,
  filters?: AnalyticsFilters,
): Promise<MilitaryLossRatioView> {
  const { data } = await http.get<MilitaryLossRatioView>(`/api/v1/analytics/military-loss-ratio`, {
    params: { profileId, playerCiv, ...buildParams(filters) },
  })
  return data
}

export async function getBuildPreferences(profileId: number, filters?: AnalyticsFilters): Promise<BuildPreferencesView> {
  const { data } = await http.get<BuildPreferencesView>(`/api/v1/analytics/build-preferences`, {
    params: { profileId, ...buildParams(filters) },
  })
  return data
}

export async function listGames(profileId: number, page = 0, size = 20): Promise<GamePageView> {
  const { data } = await http.get<GamePageView>(`/api/v1/games`, {
    params: { profileId, page, size },
  })
  return data
}

export async function getGameDetail(gameId: number, profileId: number): Promise<GameDetailView> {
  const { data } = await http.get<GameDetailView>(`/api/v1/games/${gameId}`, {
    params: { profileId },
  })
  return data
}

export async function getGameTimeline(
  gameId: number,
  profileId: number,
  opponentProfileId?: number,
): Promise<GameTimelineView> {
  const { data } = await http.get<GameTimelineView>(`/api/v1/games/${gameId}/timeline`, {
    params: { profileId, opponentProfileId },
  })
  return data
}

export async function getMetaFilters(): Promise<MetaFiltersView> {
  const { data } = await http.get<MetaFiltersView>(`/api/v1/meta/filters`)
  return data
}

export async function syncGameSummary(gameId: number, profileId: number): Promise<SummarySyncResultView> {
  const { data } = await http.post<SummarySyncResultView>(`/api/v1/games/${gameId}/sync-summary`, null, {
    params: { profileId },
  })
  return data
}

export async function syncPlayerSummaries(profileId: number, maxGames?: number): Promise<SummarySyncResultView> {
  const { data } = await http.post<SummarySyncResultView>(`/api/v1/players/${profileId}/sync-summaries`, null, {
    params: { maxGames },
  })
  return data
}

export async function getSummaryApiKeyStatus(): Promise<SummaryApiKeyStatusView> {
  const { data } = await http.get<SummaryApiKeyStatusView>(`/api/v1/settings/summary-api-key`)
  return data
}

export async function setSummaryApiKey(apiKey: string): Promise<void> {
  await http.put(`/api/v1/settings/summary-api-key`, { apiKey })
}

export async function clearSummaryApiKey(): Promise<void> {
  await http.delete(`/api/v1/settings/summary-api-key`)
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data as { error?: string } | undefined
    if (apiError?.error) return apiError.error
    return error.message
  }
  if (error instanceof Error) return error.message
  return 'Unknown error'
}
