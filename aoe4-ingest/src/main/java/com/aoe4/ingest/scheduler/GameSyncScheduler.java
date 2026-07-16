package com.aoe4.ingest.scheduler;

import com.aoe4.common.config.Aoe4Properties;
import com.aoe4.ingest.service.GameSyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
public class GameSyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(GameSyncScheduler.class);

    private final GameSyncService gameSyncService;
    private final Aoe4Properties properties;

    public GameSyncScheduler(GameSyncService gameSyncService, Aoe4Properties properties) {
        this.gameSyncService = gameSyncService;
        this.properties = properties;
    }

    @Scheduled(cron = "${aoe4.sync.cron:0 */30 * * * *}")
    public void scheduledSync() {
        if (!properties.getSync().isEnabled()) {
            return;
        }
        try {
            gameSyncService.syncDefaultProfilesIncremental();
        } catch (Exception ex) {
            log.warn("Scheduled sync failed: {}", ex.getMessage());
        }
    }
}
