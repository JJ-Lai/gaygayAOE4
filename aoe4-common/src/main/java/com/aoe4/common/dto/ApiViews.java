package com.aoe4.common.dto;

import java.time.Instant;
import java.util.List;

public final class ApiViews {

    private ApiViews() {
    }

    public record PlayerView(
            Long profileId,
            String name,
            String country,
            String steamId
    ) {
    }

    public record GamePlayerView(
            Long profileId,
            String playerName,
            String civilization,
            String result,
            Integer teamIndex,
            Integer rating,
            Integer ratingDiff
    ) {
    }

    public record GameView(
            Long gameId,
            Instant startedAt,
            Instant updatedAt,
            Integer durationSeconds,
            String mapName,
            String leaderboardCode,
            String kind,
            Integer patchNumber,
            String server,
            List<GamePlayerView> players
    ) {
    }

    public record GamePageView(
            long totalElements,
            int page,
            int size,
            List<GameView> games
    ) {
    }

    public record SyncResultView(
            Long profileId,
            int gamesProcessed,
            Instant syncedAt
    ) {
    }

    public record SummarySyncResultView(
            Long profileId,
            int attempted,
            int succeeded,
            int failed,
            Instant syncedAt
    ) {
    }

    public record PlayerSyncStatusView(
            Long profileId,
            long totalGames,
            long summariesSynced,
            long summariesPending,
            long summariesFailed,
            Instant checkedAt
    ) {
    }

    public record GameCombatStatsSnapshot(
            Integer buildingsLost,
            Integer unitsLost,
            Integer unitKills,
            Integer squadKills,
            Integer enemyDeaths
    ) {
    }

    public record GameDetailView(
            GameView game,
            boolean hasSummary,
            String summaryFetchStatus,
            Instant summaryFetchedAt,
            Integer resourceDataPoints,
            Integer buildEventCount,
            GameCombatStatsSnapshot combatStats
    ) {
    }

    public record PlayerSearchHitView(
            Long profileId,
            String name,
            String country
    ) {
    }

    public record PlayerSearchResultView(
            int totalCount,
            List<PlayerSearchHitView> players
    ) {
    }

    public record SummaryApiKeyStatusView(
            boolean configured,
            String maskedSuffix,
            boolean runtimeOverride
    ) {
    }

    public record SummaryApiKeyRequest(
            String apiKey
    ) {
    }

    public record SyncStatusCountView(
            String status,
            long count
    ) {
    }

    public record SyncAlertView(
            String severity,
            String code,
            String message,
            long count
    ) {
    }

    public record SyncOverviewView(
            long totalPlayers,
            long totalGames,
            long gamesWithoutSummary,
            List<SyncStatusCountView> summaryStatusCounts,
            List<SyncAlertView> alerts,
            Instant checkedAt
    ) {
    }

    public record FailedSummaryView(
            long gameId,
            Long profileId,
            String fetchStatus,
            int retryCount,
            String errorMessage,
            Instant fetchedAt
    ) {
    }

    public record FailedSummariesView(
            List<FailedSummaryView> failures
    ) {
    }

    public record PlayerSyncStatusBatchView(
            List<PlayerSyncStatusView> players
    ) {
    }

    public record BatchSyncPlayerResultView(
            long profileId,
            int gamesProcessed,
            int summariesAttempted,
            int summariesSucceeded,
            String error
    ) {
    }

    public record BatchSyncResultView(
            List<BatchSyncPlayerResultView> results,
            Instant syncedAt
    ) {
    }

    public record RetryFailedResultView(
            Long profileId,
            int resetCount,
            int attempted,
            int succeeded,
            int failed,
            Instant retriedAt
    ) {
    }

    public record QueryPlanEntryView(
            String queryKey,
            String description,
            long executionMs,
            List<String> planLines
    ) {
    }

    public record QueryPlanReportView(
            long profileId,
            String databaseProduct,
            List<QueryPlanEntryView> plans,
            Instant checkedAt
    ) {
    }

    public record AlertNotifyResultView(
            boolean sent,
            String reason,
            int alertCount,
            Instant checkedAt
    ) {
    }

    public record ReparseSummariesResultView(
            Long profileId,
            int attempted,
            int succeeded,
            int failed,
            Instant reparsedAt
    ) {
    }
}
