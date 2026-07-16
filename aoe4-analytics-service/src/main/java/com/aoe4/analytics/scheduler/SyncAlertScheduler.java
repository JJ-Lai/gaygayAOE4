package com.aoe4.analytics.scheduler;

import com.aoe4.analytics.service.OpsService;
import com.aoe4.analytics.service.SyncAlertNotifier;
import com.aoe4.common.config.Aoe4Properties;
import com.aoe4.common.dto.ApiViews.SyncOverviewView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class SyncAlertScheduler {

    private static final Logger log = LoggerFactory.getLogger(SyncAlertScheduler.class);

    private final OpsService opsService;
    private final SyncAlertNotifier syncAlertNotifier;
    private final Aoe4Properties properties;

    public SyncAlertScheduler(OpsService opsService,
                              SyncAlertNotifier syncAlertNotifier,
                              Aoe4Properties properties) {
        this.opsService = opsService;
        this.syncAlertNotifier = syncAlertNotifier;
        this.properties = properties;
    }

    @Scheduled(cron = "${aoe4.ops.alert-check-cron:0 */15 * * * *}")
    public void checkAndNotify() {
        if (!properties.getOps().isAlertWebhookEnabled()) {
            return;
        }
        try {
            SyncOverviewView overview = opsService.getSyncOverview();
            var result = syncAlertNotifier.notifyIfNeeded(overview.alerts(), false);
            if (result.sent()) {
                log.info("Scheduled sync alert notification sent ({} alerts)", result.alertCount());
            }
        } catch (Exception ex) {
            log.warn("Scheduled sync alert check failed: {}", ex.getMessage());
        }
    }
}
