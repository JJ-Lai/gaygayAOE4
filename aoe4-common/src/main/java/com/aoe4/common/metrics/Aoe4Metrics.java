package com.aoe4.common.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.Timer;
import com.aoe4.common.dto.ApiViews.SyncAlertView;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class Aoe4Metrics {

    private final MeterRegistry registry;
    private final Counter playerSyncCounter;
    private final Counter gamesSyncedCounter;
    private final Counter aggregationRefreshCounter;
    private final Timer aggregationRefreshTimer;
    private final AtomicLong gamesWithoutSummaryGauge = new AtomicLong(0);
    private final AtomicLong exhaustedRetriesGauge = new AtomicLong(0);
    private final AtomicLong highFailureCountGauge = new AtomicLong(0);
    private final AtomicLong manyGamesWithoutSummaryGauge = new AtomicLong(0);

    public Aoe4Metrics(ObjectProvider<MeterRegistry> registryProvider) {
        this.registry = registryProvider.getIfAvailable();
        if (this.registry != null) {
            this.playerSyncCounter = Counter.builder("aoe4.sync.player")
                    .description("Player game list sync operations")
                    .register(registry);
            this.gamesSyncedCounter = Counter.builder("aoe4.sync.games")
                    .description("Games ingested during sync")
                    .register(registry);
            this.aggregationRefreshCounter = Counter.builder("aoe4.aggregation.refresh")
                    .description("Aggregation table refresh operations")
                    .register(registry);
            this.aggregationRefreshTimer = Timer.builder("aoe4.aggregation.refresh.duration")
                    .description("Aggregation refresh duration")
                    .register(registry);
            registerSyncAlertGauges(registry);
        } else {
            this.playerSyncCounter = null;
            this.gamesSyncedCounter = null;
            this.aggregationRefreshCounter = null;
            this.aggregationRefreshTimer = null;
        }
    }

    public void recordPlayerSync(int gamesProcessed) {
        if (playerSyncCounter == null) {
            return;
        }
        playerSyncCounter.increment();
        gamesSyncedCounter.increment(gamesProcessed);
    }

    public void recordSummarySync(String status) {
        if (registry == null) {
            return;
        }
        registry.counter("aoe4.sync.summary", "status", status).increment();
    }

    public void recordAggregationRefresh() {
        if (aggregationRefreshCounter != null) {
            aggregationRefreshCounter.increment();
        }
    }

    public Timer.Sample startAggregationRefresh() {
        if (aggregationRefreshTimer == null) {
            return null;
        }
        return Timer.start(registry);
    }

    public void stopAggregationRefresh(Timer.Sample sample) {
        if (sample != null && aggregationRefreshTimer != null) {
            sample.stop(aggregationRefreshTimer);
        }
    }

    public void updateSyncAlertGauges(List<SyncAlertView> alerts, long gamesWithoutSummary) {
        if (registry == null) {
            return;
        }
        gamesWithoutSummaryGauge.set(gamesWithoutSummary);
        exhaustedRetriesGauge.set(alertCount(alerts, "EXHAUSTED_RETRIES"));
        highFailureCountGauge.set(alertCount(alerts, "HIGH_FAILURE_COUNT"));
        manyGamesWithoutSummaryGauge.set(alertCount(alerts, "MANY_GAMES_WITHOUT_SUMMARY"));
    }

    private static long alertCount(List<SyncAlertView> alerts, String code) {
        return alerts.stream()
                .filter(alert -> code.equals(alert.code()))
                .mapToLong(SyncAlertView::count)
                .findFirst()
                .orElse(0L);
    }

    private void registerSyncAlertGauges(MeterRegistry meterRegistry) {
        Gauge.builder("aoe4.sync.games_without_summary", gamesWithoutSummaryGauge, AtomicLong::get)
                .description("Games without any summary fetch attempt")
                .register(meterRegistry);
        registerAlertGauge(meterRegistry, "exhausted_retries", exhaustedRetriesGauge,
                "Summary rows that exhausted retry attempts");
        registerAlertGauge(meterRegistry, "high_failure_count", highFailureCountGauge,
                "Active high failure count alert value");
        registerAlertGauge(meterRegistry, "many_games_without_summary", manyGamesWithoutSummaryGauge,
                "Active many games without summary alert value");
    }

    private static void registerAlertGauge(MeterRegistry meterRegistry,
                                           String code,
                                           AtomicLong holder,
                                           String description) {
        Gauge.builder("aoe4.sync.alert.count", holder, AtomicLong::get)
                .tags(Tags.of("code", code))
                .description(description)
                .register(meterRegistry);
    }
}
