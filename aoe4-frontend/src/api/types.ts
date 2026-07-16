export interface PlayerView {
  profileId: number
  name: string | null
  country: string | null
  steamId: string | null
}

export interface PlayerSearchHitView {
  profileId: number
  name: string
  country: string | null
}

export interface PlayerSearchResultView {
  totalCount: number
  players: PlayerSearchHitView[]
}

export interface PlayerOverviewView {
  profileId: number
  totalGames: number
  wins: number
  losses: number
  winRate: number
  mostPlayedCiv: string | null
  gamesWithSummary: number
  recentTrend: RecentTrendPoint[]
}

export interface RecentTrendPoint {
  startedAt: string | null
  result: string | null
  civilization: string | null
  gameId: number
}

export interface ResourceTimelinePoint {
  minute: number
  resource: string
  value: number
  gameCount: number
}

export interface ResourceTimelineView {
  profileId: number
  points: ResourceTimelinePoint[]
}

export interface MatchupRow {
  playerCiv: string
  opponentCiv: string
  wins: number
  losses: number
  winRate: number
  avgMilitaryDiff: number | null
}

export interface MatchupMatrixView {
  profileId: number
  matchups: MatchupRow[]
}

export interface MapStatRow {
  mapCode: string
  mapName: string
  games: number
  wins: number
  losses: number
  winRate: number
}

export interface MapStatsView {
  profileId: number
  maps: MapStatRow[]
}

export interface PatchStatRow {
  patchCode: string
  patchLabel: string
  games: number
  wins: number
  losses: number
  winRate: number
}

export interface PatchStatsView {
  profileId: number
  patches: PatchStatRow[]
}

export interface ModeStatRow {
  modeCode: string
  modeName: string
  games: number
  wins: number
  losses: number
  winRate: number
}

export interface ModeStatsView {
  profileId: number
  modes: ModeStatRow[]
}

export interface CombatStatRow {
  civCode: string
  civName: string
  games: number
  avgBuildingsLost: number
  avgUnitsLost: number
  avgUnitKills: number
  avgSquadKills: number
  avgEnemyDeaths: number
}

export interface CombatStatsView {
  profileId: number
  civilizations: CombatStatRow[]
}

export interface UnitLossRow {
  entityType: string
  pbgid: number | null
  displayName: string
  lossCount: number
  gameCount: number
}

export interface UnitLossStatsView {
  profileId: number
  units: UnitLossRow[]
}

export interface SyncStatusCountView {
  status: string
  count: number
}

export interface SyncOverviewView {
  totalPlayers: number
  totalGames: number
  gamesWithoutSummary: number
  summaryStatusCounts: SyncStatusCountView[]
  alerts: SyncAlertView[]
  checkedAt: string
}

export interface SyncAlertView {
  severity: string
  code: string
  message: string
  count: number
}

export interface FailedSummaryView {
  gameId: number
  profileId: number | null
  fetchStatus: string
  retryCount: number
  errorMessage: string | null
  fetchedAt: string | null
}

export interface FailedSummariesView {
  failures: FailedSummaryView[]
}

export interface PlayerSyncStatusBatchView {
  players: PlayerSyncStatusView[]
}

export interface BatchSyncPlayerResult {
  profileId: number
  gamesProcessed: number
  summariesAttempted: number
  summariesSucceeded: number
  error: string | null
}

export interface BatchSyncResultView {
  results: BatchSyncPlayerResult[]
  syncedAt: string
}

export interface RetryFailedResultView {
  profileId: number | null
  resetCount: number
  attempted: number
  succeeded: number
  failed: number
  retriedAt: string
}

export interface SummarySyncResultView {
  profileId: number
  attempted: number
  succeeded: number
  failed: number
  syncedAt: string
}

export interface ReparseSummariesResultView {
  profileId: number | null
  attempted: number
  succeeded: number
  failed: number
  reparsedAt: string
}

export interface QueryPlanEntryView {
  queryKey: string
  description: string
  executionMs: number
  planLines: string[]
}

export interface QueryPlanReportView {
  profileId: number
  databaseProduct: string
  plans: QueryPlanEntryView[]
  checkedAt: string
}

export interface AlertNotifyResultView {
  sent: boolean
  reason: string
  alertCount: number
  checkedAt: string
}

export interface MilitaryLossRow {
  opponentCiv: string
  games: number
  wins: number
  winRate: number
  avgMilitaryDiff: number | null
}

export interface MilitaryLossRatioView {
  profileId: number
  playerCiv: string
  byOpponentCiv: MilitaryLossRow[]
}

export interface BuildPreferenceRow {
  entityType: string
  pbgid: number | null
  displayName: string
  count: number
}

export interface BuildPreferencesView {
  profileId: number
  minuteFrom: number
  minuteTo: number
  items: BuildPreferenceRow[]
}

export interface GamePlayerView {
  profileId: number
  playerName: string | null
  civilization: string | null
  result: string | null
  teamIndex: number | null
  rating: number | null
  ratingDiff: number | null
}

export interface GameView {
  gameId: number
  startedAt: string | null
  updatedAt: string | null
  durationSeconds: number | null
  mapName: string | null
  leaderboardCode: string | null
  kind: string | null
  patchNumber: number | null
  server: string | null
  players: GamePlayerView[]
}

export interface GamePageView {
  totalElements: number
  page: number
  size: number
  games: GameView[]
}

export interface GameCombatStatsSnapshot {
  buildingsLost: number | null
  unitsLost: number | null
  unitKills: number | null
  squadKills: number | null
  enemyDeaths: number | null
}

export interface GameDetailView {
  game: GameView
  hasSummary: boolean
  summaryFetchStatus: string | null
  summaryFetchedAt: string | null
  resourceDataPoints: number | null
  buildEventCount: number | null
  combatStats: GameCombatStatsSnapshot | null
}

export interface PlayerSyncStatusView {
  profileId: number
  totalGames: number
  summariesSynced: number
  summariesPending: number
  summariesFailed: number
  checkedAt: string
}

export interface SyncResultView {
  profileId: number
  gamesProcessed: number
  syncedAt: string
}

export interface MetaOption {
  code: string
  displayName: string
}

export interface MetaFiltersView {
  civilizations: MetaOption[]
  maps: MetaOption[]
  leaderboards: MetaOption[]
  patches: MetaOption[]
  resourceTypes: MetaOption[]
}

export interface TimelineMinuteValue {
  minute: number
  secondMark: number
  accumulatedValue: number
  perMinuteValue: number | null
}

export interface TimelineResourceSeries {
  resource: string
  points: TimelineMinuteValue[]
}

export interface TimelineArmyPoint {
  minute: number
  secondMark: number
  armyValue: number
}

export interface TimelineBuildEvent {
  eventSecond: number
  minute: number
  entityType: string
  pbgid: number | null
  displayName: string | null
  eventKind: string
}

export interface TimelineOpponentOption {
  profileId: number
  playerName: string | null
  civilization: string | null
  hasTimelineData: boolean
  relationship: 'teammate' | 'opponent' | 'unknown' | null
}

export interface TimelineOpponentView {
  profileId: number
  playerName: string | null
  civilization: string | null
  resources: TimelineResourceSeries[]
  armyValues: TimelineArmyPoint[]
  buildEvents: TimelineBuildEvent[]
}

export interface GameTimelineView {
  gameId: number
  profileId: number
  resources: TimelineResourceSeries[]
  armyValues: TimelineArmyPoint[]
  buildEvents: TimelineBuildEvent[]
  opponent: TimelineOpponentView | null
  availableOpponents: TimelineOpponentOption[]
}

export interface AnalyticsFilters {
  civ?: string
  opponentCiv?: string
  leaderboard?: string
  patch?: number
  ratingMin?: number
  ratingMax?: number
  resources?: string[]
  minuteFrom?: number
  minuteTo?: number
  dateFrom?: string
  dateTo?: string
}

export interface FavoritePlayer {
  profileId: number
  name: string | null
}

export interface ApiError {
  error: string
}

export interface SummaryApiKeyStatusView {
  configured: boolean
  maskedSuffix: string | null
  runtimeOverride: boolean
}
