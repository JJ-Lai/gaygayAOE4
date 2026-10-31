package com.aoe4.ingest.scheduler;

import com.aoe4.common.config.Aoe4Properties;
import com.aoe4.ingest.service.SummarySyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class SummarySyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(SummarySyncScheduler.class);

    private final SummarySyncService summarySyncService;
    private final Aoe4Properties properties;

    public SummarySyncScheduler(SummarySyncService summarySyncService, Aoe4Properties properties) {
        this.summarySyncService = summarySyncService;
        this.properties = properties;
    }

    @Scheduled(cron = "${aoe4.summary.sync-cron:0 */5 * * * *}")
    public void scheduledSummarySync() {
        if (!properties.getSummary().isSyncEnabled()) {
            return;
        }
        for (Long profileId : properties.getSync().getDefaultProfileIds()) {
            try {
                summarySyncService.syncPendingForProfile(profileId);
            } catch (Exception ex) {
                log.warn("Scheduled summary sync failed for profile {}: {}", profileId, ex.getMessage());
            }
        }
    }
}
