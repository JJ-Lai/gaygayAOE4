package com.aoe4.analytics.scheduler;

import com.aoe4.analytics.service.AggregationRefreshService;
import com.aoe4.common.config.Aoe4Properties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
public class AggregationRefreshScheduler {

    private static final Logger log = LoggerFactory.getLogger(AggregationRefreshScheduler.class);

    private final AggregationRefreshService aggregationRefreshService;
    private final Aoe4Properties properties;

    public AggregationRefreshScheduler(AggregationRefreshService aggregationRefreshService,
                                       Aoe4Properties properties) {
        this.aggregationRefreshService = aggregationRefreshService;
        this.properties = properties;
    }

    @Scheduled(cron = "${aoe4.aggregation.refresh-cron:0 0 */6 * * *}")
    public void refreshAllProfiles() {
        if (!properties.getAggregation().isEnabled()) {
            return;
        }
        log.info("Starting scheduled aggregation refresh");
        aggregationRefreshService.refreshAllProfiles();
    }
}
