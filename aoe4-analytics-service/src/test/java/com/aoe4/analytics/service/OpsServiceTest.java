package com.aoe4.analytics.service;

import com.aoe4.common.dto.ApiViews.SyncOverviewView;
import com.aoe4.common.metrics.Aoe4Metrics;
import com.aoe4.persistence.repository.DimPlayerRepository;
import com.aoe4.persistence.repository.FactGameRepository;
import com.aoe4.persistence.repository.RawGameSummaryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OpsServiceTest {

    @Mock
    private DimPlayerRepository dimPlayerRepository;
    @Mock
    private FactGameRepository factGameRepository;
    @Mock
    private RawGameSummaryRepository rawGameSummaryRepository;
    @Mock
    private GameQueryService gameQueryService;
    @Mock
    private com.aoe4.ingest.service.GameSyncService gameSyncService;
    @Mock
    private com.aoe4.ingest.service.SummarySyncService summarySyncService;
    @Mock
    private AggregationRefreshService aggregationRefreshService;
    @Mock
    private QueryPlanService queryPlanService;
    @Mock
    private Aoe4Metrics aoe4Metrics;
    @Mock
    private com.aoe4.ingest.service.SummaryReparseService summaryReparseService;

    private OpsService opsService;

    @BeforeEach
    void setUp() {
        opsService = new OpsService(
                dimPlayerRepository,
                factGameRepository,
                rawGameSummaryRepository,
                gameQueryService,
                gameSyncService,
                summarySyncService,
                aggregationRefreshService,
                queryPlanService,
                aoe4Metrics,
                summaryReparseService
        );
    }

    @Test
    void syncOverviewIncludesAlertsWhenThresholdsExceeded() {
        when(dimPlayerRepository.count()).thenReturn(3L);
        when(factGameRepository.count()).thenReturn(100L);
        when(rawGameSummaryRepository.countGamesWithoutSummary()).thenReturn(60L);
        when(rawGameSummaryRepository.countExhaustedRetries(3)).thenReturn(2L);
        when(rawGameSummaryRepository.countGroupedByFetchStatus()).thenReturn(List.of(
                statusRow("SUCCESS", 80),
                statusRow("FAILED", 12)
        ));

        SyncOverviewView overview = opsService.getSyncOverview();

        assertThat(overview.alerts()).hasSize(3);
        assertThat(overview.alerts())
                .extracting(alert -> alert.code())
                .containsExactlyInAnyOrder(
                        "EXHAUSTED_RETRIES",
                        "HIGH_FAILURE_COUNT",
                        "MANY_GAMES_WITHOUT_SUMMARY"
                );
    }

    @Test
    void batchSyncStatusIgnoresInvalidProfileIds() {
        var result = opsService.getBatchSyncStatus("abc, ,10861747");

        assertThat(result.players()).isEmpty();
    }

    private static RawGameSummaryRepository.StatusCountRow statusRow(String status, long count) {
        return new RawGameSummaryRepository.StatusCountRow() {
            @Override
            public String getStatus() {
                return status;
            }

            @Override
            public long getCount() {
                return count;
            }
        };
    }
}
