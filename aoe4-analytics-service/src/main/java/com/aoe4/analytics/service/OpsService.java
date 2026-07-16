package com.aoe4.analytics.service;

import com.aoe4.common.dto.ApiViews.BatchSyncPlayerResultView;
import com.aoe4.common.dto.ApiViews.BatchSyncResultView;
import com.aoe4.common.dto.ApiViews.FailedSummariesView;
import com.aoe4.common.dto.ApiViews.FailedSummaryView;
import com.aoe4.common.dto.ApiViews.PlayerSyncStatusBatchView;
import com.aoe4.common.dto.ApiViews.PlayerSyncStatusView;
import com.aoe4.common.dto.ApiViews.QueryPlanReportView;
import com.aoe4.common.dto.ApiViews.ReparseSummariesResultView;
import com.aoe4.common.dto.ApiViews.RetryFailedResultView;
import com.aoe4.common.dto.ApiViews.SyncAlertView;
import com.aoe4.common.dto.ApiViews.SyncOverviewView;
import com.aoe4.common.dto.ApiViews.SyncStatusCountView;
import com.aoe4.common.dto.ApiViews.SummarySyncResultView;
import com.aoe4.common.metrics.Aoe4Metrics;
import com.aoe4.ingest.service.GameSyncService;
import com.aoe4.ingest.service.SummaryReparseService;
import com.aoe4.ingest.service.SummarySyncService;
import com.aoe4.persistence.entity.RawGameSummary;
import com.aoe4.persistence.repository.DimPlayerRepository;
import com.aoe4.persistence.repository.FactGameRepository;
import com.aoe4.persistence.repository.RawGameSummaryRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

@Service
public class OpsService {

    private static final List<String> FAILURE_STATUSES = List.of("FAILED", "RATE_LIMITED", "PARSE_FAILED");
    private static final int MAX_BATCH_PLAYERS = 10;
    private static final int MAX_SUMMARY_RETRIES = 3;
    private static final long GAMES_WITHOUT_SUMMARY_WARN_THRESHOLD = 50;
    private static final long FAILURE_COUNT_WARN_THRESHOLD = 10;

    private final DimPlayerRepository dimPlayerRepository;
    private final FactGameRepository factGameRepository;
    private final RawGameSummaryRepository rawGameSummaryRepository;
    private final GameQueryService gameQueryService;
    private final GameSyncService gameSyncService;
    private final SummarySyncService summarySyncService;
    private final AggregationRefreshService aggregationRefreshService;
    private final QueryPlanService queryPlanService;
    private final Aoe4Metrics aoe4Metrics;
    private final SummaryReparseService summaryReparseService;

    public OpsService(DimPlayerRepository dimPlayerRepository,
                      FactGameRepository factGameRepository,
                      RawGameSummaryRepository rawGameSummaryRepository,
                      GameQueryService gameQueryService,
                      GameSyncService gameSyncService,
                      SummarySyncService summarySyncService,
                      AggregationRefreshService aggregationRefreshService,
                      QueryPlanService queryPlanService,
                      Aoe4Metrics aoe4Metrics,
                      SummaryReparseService summaryReparseService) {
        this.dimPlayerRepository = dimPlayerRepository;
        this.factGameRepository = factGameRepository;
        this.rawGameSummaryRepository = rawGameSummaryRepository;
        this.gameQueryService = gameQueryService;
        this.gameSyncService = gameSyncService;
        this.summarySyncService = summarySyncService;
        this.aggregationRefreshService = aggregationRefreshService;
        this.queryPlanService = queryPlanService;
        this.aoe4Metrics = aoe4Metrics;
        this.summaryReparseService = summaryReparseService;
    }

    public SyncOverviewView getSyncOverview() {
        List<SyncStatusCountView> statusCounts = rawGameSummaryRepository.countGroupedByFetchStatus().stream()
                .map(row -> new SyncStatusCountView(row.getStatus(), row.getCount()))
                .toList();
        long gamesWithoutSummary = rawGameSummaryRepository.countGamesWithoutSummary();
        long exhaustedRetries = rawGameSummaryRepository.countExhaustedRetries(MAX_SUMMARY_RETRIES);
        long failureCount = statusCounts.stream()
                .filter(row -> FAILURE_STATUSES.contains(row.status()))
                .mapToLong(SyncStatusCountView::count)
                .sum();
        List<SyncAlertView> alerts = buildSyncAlerts(exhaustedRetries, failureCount, gamesWithoutSummary);
        aoe4Metrics.updateSyncAlertGauges(alerts, gamesWithoutSummary);
        return new SyncOverviewView(
                dimPlayerRepository.count(),
                factGameRepository.count(),
                gamesWithoutSummary,
                statusCounts,
                alerts,
                Instant.now()
        );
    }

    private static List<SyncAlertView> buildSyncAlerts(long exhaustedRetries, long failureCount,
                                                       long gamesWithoutSummary) {
        List<SyncAlertView> alerts = new ArrayList<>();
        if (exhaustedRetries > 0) {
            alerts.add(new SyncAlertView(
                    "ERROR",
                    "EXHAUSTED_RETRIES",
                    "有 Summary 已達最大重試次數（" + MAX_SUMMARY_RETRIES + "），需手動重試",
                    exhaustedRetries
            ));
        }
        if (failureCount >= FAILURE_COUNT_WARN_THRESHOLD) {
            alerts.add(new SyncAlertView(
                    "WARNING",
                    "HIGH_FAILURE_COUNT",
                    "Summary 失敗/限流/解析錯誤筆數偏高",
                    failureCount
            ));
        }
        if (gamesWithoutSummary >= GAMES_WITHOUT_SUMMARY_WARN_THRESHOLD) {
            alerts.add(new SyncAlertView(
                    "WARNING",
                    "MANY_GAMES_WITHOUT_SUMMARY",
                    "尚有大量對戰尚未嘗試抓取 Summary",
                    gamesWithoutSummary
            ));
        }
        return alerts;
    }

    public QueryPlanReportView getQueryPlans(long profileId) {
        return queryPlanService.explainPlans(profileId);
    }

    public ReparseSummariesResultView reparseSummaries(Long profileId, int maxGames) {
        return summaryReparseService.reparseSuccessSummaries(profileId, maxGames);
    }

    public FailedSummariesView getRecentFailures(int limit) {
        int size = Math.min(Math.max(limit, 1), 100);
        List<FailedSummaryView> failures = rawGameSummaryRepository
                .findByFetchStatusInOrderByFetchedAtDesc(FAILURE_STATUSES, PageRequest.of(0, size))
                .stream()
                .map(this::toFailedSummaryView)
                .toList();
        return new FailedSummariesView(failures);
    }

    public PlayerSyncStatusBatchView getBatchSyncStatus(List<Long> profileIds) {
        List<PlayerSyncStatusView> players = profileIds.stream()
                .distinct()
                .filter(id -> id != null && id > 0)
                .map(this::safeSyncStatus)
                .filter(Objects::nonNull)
                .toList();
        return new PlayerSyncStatusBatchView(players);
    }

    private PlayerSyncStatusView safeSyncStatus(long profileId) {
        try {
            return gameQueryService.getSyncStatus(profileId);
        } catch (PlayerNotFoundException ex) {
            return null;
        }
    }

    public PlayerSyncStatusBatchView getBatchSyncStatus(String profileIdsCsv) {
        if (profileIdsCsv == null || profileIdsCsv.isBlank()) {
            return new PlayerSyncStatusBatchView(List.of());
        }
        List<Long> ids = Arrays.stream(profileIdsCsv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(OpsService::parseProfileId)
                .filter(Objects::nonNull)
                .toList();
        return getBatchSyncStatus(ids);
    }

    public BatchSyncResultView batchSync(List<Long> profileIds) {
        List<BatchSyncPlayerResultView> results = profileIds.stream()
                .distinct()
                .filter(id -> id != null && id > 0)
                .limit(MAX_BATCH_PLAYERS)
                .map(this::syncPlayerPipeline)
                .toList();
        return new BatchSyncResultView(results, Instant.now());
    }

    public BatchSyncResultView batchSync(String profileIdsCsv) {
        if (profileIdsCsv == null || profileIdsCsv.isBlank()) {
            return new BatchSyncResultView(List.of(), Instant.now());
        }
        List<Long> ids = Arrays.stream(profileIdsCsv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(OpsService::parseProfileId)
                .filter(Objects::nonNull)
                .toList();
        return batchSync(ids);
    }

    public RetryFailedResultView retryFailedSummaries(Long profileId, int maxGames) {
        int reset = rawGameSummaryRepository.resetExhaustedRetries(profileId, MAX_SUMMARY_RETRIES);
        int capped = Math.min(Math.max(maxGames, 1), 50);
        SummarySyncResultView syncResult = summarySyncService.retryFailedSummaries(profileId, capped);
        return new RetryFailedResultView(
                profileId,
                reset,
                syncResult.attempted(),
                syncResult.succeeded(),
                syncResult.failed(),
                Instant.now()
        );
    }

    private BatchSyncPlayerResultView syncPlayerPipeline(long profileId) {
        try {
            var gameResult = gameSyncService.syncPlayer(profileId);
            var summaryResult = summarySyncService.syncPendingForProfile(profileId, 20);
            aggregationRefreshService.refreshProfile(profileId);
            return new BatchSyncPlayerResultView(
                    profileId,
                    gameResult.gamesProcessed(),
                    summaryResult.attempted(),
                    summaryResult.succeeded(),
                    null
            );
        } catch (Exception ex) {
            return new BatchSyncPlayerResultView(profileId, 0, 0, 0, ex.getMessage());
        }
    }

    private static Long parseProfileId(String value) {
        try {
            long id = Long.parseLong(value);
            return id > 0 ? id : null;
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private FailedSummaryView toFailedSummaryView(RawGameSummary summary) {
        return new FailedSummaryView(
                summary.getGameId(),
                summary.getProfileId(),
                summary.getFetchStatus(),
                summary.getRetryCount(),
                summary.getErrorMessage(),
                summary.getFetchedAt()
        );
    }
}
