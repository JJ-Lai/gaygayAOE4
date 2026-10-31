package com.aoe4.api.web;

import com.aoe4.analytics.service.OpsService;
import com.aoe4.analytics.service.SyncAlertNotifier;
import com.aoe4.common.dto.ApiViews.AlertNotifyResultView;
import com.aoe4.common.dto.ApiViews.BatchSyncResultView;
import com.aoe4.common.dto.ApiViews.FailedSummariesView;
import com.aoe4.common.dto.ApiViews.PlayerSyncStatusBatchView;
import com.aoe4.common.dto.ApiViews.QueryPlanReportView;
import com.aoe4.common.dto.ApiViews.ReparseSummariesResultView;
import com.aoe4.common.dto.ApiViews.RetryFailedResultView;
import com.aoe4.common.dto.ApiViews.SyncOverviewView;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/ops")
public class OpsController {

    private final OpsService opsService;
    private final SyncAlertNotifier syncAlertNotifier;

    public OpsController(OpsService opsService, SyncAlertNotifier syncAlertNotifier) {
        this.opsService = opsService;
        this.syncAlertNotifier = syncAlertNotifier;
    }

    @GetMapping("/sync-overview")
    public SyncOverviewView syncOverview() {
        return opsService.getSyncOverview();
    }

    @GetMapping("/failed-summaries")
    public FailedSummariesView failedSummaries(@RequestParam(defaultValue = "20") int limit) {
        return opsService.getRecentFailures(limit);
    }

    @GetMapping("/query-plans")
    public QueryPlanReportView queryPlans(@RequestParam long profileId) {
        return opsService.getQueryPlans(profileId);
    }

    @GetMapping("/players/sync-status")
    public PlayerSyncStatusBatchView batchSyncStatus(@RequestParam String profileIds) {
        return opsService.getBatchSyncStatus(profileIds);
    }

    @PostMapping("/batch-sync")
    public BatchSyncResultView batchSync(@RequestParam String profileIds) {
        return opsService.batchSync(profileIds);
    }

    @PostMapping("/retry-failed-summaries")
    public RetryFailedResultView retryFailedSummaries(@RequestParam(required = false) Long profileId,
                                                      @RequestParam(defaultValue = "20") int maxGames) {
        return opsService.retryFailedSummaries(profileId, maxGames);
    }

    @PostMapping("/notify-alerts")
    public AlertNotifyResultView notifyAlerts(@RequestParam(defaultValue = "false") boolean force) {
        return syncAlertNotifier.notifyIfNeeded(opsService.getSyncOverview().alerts(), force);
    }

    @PostMapping("/reparse-summaries")
    public ReparseSummariesResultView reparseSummaries(@RequestParam(required = false) Long profileId,
                                                       @RequestParam(defaultValue = "20") int maxGames) {
        return opsService.reparseSummaries(profileId, maxGames);
    }
}
