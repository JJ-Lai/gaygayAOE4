package com.aoe4.analytics.service;

import com.aoe4.analytics.cache.AnalyticsResponseCache;
import com.aoe4.analytics.filter.AnalyticsFilter;
import com.aoe4.common.dto.AnalyticsViews.CombatStatsView;
import com.aoe4.common.dto.AnalyticsViews.UnitLossStatsView;
import com.aoe4.persistence.entity.FactGame;
import com.aoe4.persistence.entity.FactGamePlayer;
import com.aoe4.persistence.repository.AnalyticsRepository;
import com.aoe4.persistence.repository.AggAnalyticsRepository;
import com.aoe4.persistence.repository.DimBuildingRepository;
import com.aoe4.persistence.repository.DimCivilizationRepository;
import com.aoe4.persistence.repository.DimPlayerRepository;
import com.aoe4.persistence.repository.DimTechnologyRepository;
import com.aoe4.persistence.repository.DimUnitRepository;
import com.aoe4.persistence.repository.FactBuildEventRepository;
import com.aoe4.persistence.repository.FactGamePlayerArmyValueRepository;
import com.aoe4.persistence.repository.FactGamePlayerRepository;
import com.aoe4.persistence.repository.FactGamePlayerResourceRepository;
import com.aoe4.persistence.repository.FactGameRepository;
import com.aoe4.persistence.repository.RawGameSummaryRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AnalyticsServiceTest {

    @Mock
    private DimPlayerRepository dimPlayerRepository;
    @Mock
    private FactGamePlayerRepository factGamePlayerRepository;
    @Mock
    private FactGameRepository factGameRepository;
    @Mock
    private RawGameSummaryRepository rawGameSummaryRepository;
    @Mock
    private AnalyticsRepository analyticsRepository;
    @Mock
    private AggAnalyticsRepository aggAnalyticsRepository;
    @Mock
    private AnalyticsResponseCache analyticsResponseCache;
    @Mock
    private FactGamePlayerResourceRepository resourceRepository;
    @Mock
    private FactGamePlayerArmyValueRepository armyValueRepository;
    @Mock
    private FactBuildEventRepository buildEventRepository;
    @Mock
    private DimCivilizationRepository dimCivilizationRepository;
    @Mock
    private DimUnitRepository dimUnitRepository;
    @Mock
    private DimBuildingRepository dimBuildingRepository;
    @Mock
    private DimTechnologyRepository dimTechnologyRepository;

    @InjectMocks
    private AnalyticsService analyticsService;

    @Test
    void overviewComputesWinRate() {
        long profileId = 10861747L;
        when(dimPlayerRepository.existsById(profileId)).thenReturn(true);
        when(rawGameSummaryRepository.countByProfileIdAndFetchStatus(profileId, "SUCCESS")).thenReturn(3L);

        FactGamePlayer win = gamePlayer(1L, profileId, "rus", true);
        FactGamePlayer loss = gamePlayer(2L, profileId, "english", false);
        when(factGamePlayerRepository.findByProfileId(profileId)).thenReturn(List.of(win, loss));

        FactGame game1 = game(1L);
        FactGame game2 = game(2L);
        when(factGameRepository.findById(1L)).thenReturn(Optional.of(game1));
        when(factGameRepository.findById(2L)).thenReturn(Optional.of(game2));

        var overview = analyticsService.getPlayerOverview(AnalyticsFilter.builder(profileId).build());

        assertThat(overview.totalGames()).isEqualTo(2);
        assertThat(overview.wins()).isEqualTo(1);
        assertThat(overview.losses()).isEqualTo(1);
        assertThat(overview.winRate()).isEqualTo(0.5);
        assertThat(overview.mostPlayedCiv()).isIn("rus", "english");
        assertThat(overview.gamesWithSummary()).isEqualTo(3);
    }

    @Test
    void combatStatsUsesRepositoryAggregates() {
        long profileId = 1224481L;
        when(dimPlayerRepository.existsById(profileId)).thenReturn(true);
        when(analyticsResponseCache.getOrLoad(any(), any())).thenAnswer(invocation -> {
            java.util.function.Supplier<?> supplier = invocation.getArgument(1);
            return supplier.get();
        });
        when(analyticsRepository.aggregateCombatStats(
                eq(profileId), eq(null), eq(null), eq(null), eq(null), eq(null), eq(null), eq(null)
        )).thenReturn(List.of(new AnalyticsRepository.CombatAggregateRow() {
            @Override
            public String getCivCode() {
                return "rus";
            }

            @Override
            public long getGames() {
                return 5;
            }

            @Override
            public Double getAvgBuildingsLost() {
                return 10.0;
            }

            @Override
            public Double getAvgUnitsLost() {
                return 20.0;
            }

            @Override
            public Double getAvgUnitKills() {
                return 15.0;
            }

            @Override
            public Double getAvgSquadKills() {
                return 12.0;
            }

            @Override
            public Double getAvgEnemyDeaths() {
                return 8.0;
            }
        }));

        CombatStatsView view = analyticsService.getCombatStats(AnalyticsFilter.builder(profileId).build());

        assertThat(view.civilizations()).hasSize(1);
        assertThat(view.civilizations().get(0).civCode()).isEqualTo("rus");
        assertThat(view.civilizations().get(0).avgUnitsLost()).isEqualTo(20.0);
    }

    @Test
    void unitLossStatsUsesRepositoryAggregates() {
        long profileId = 1224481L;
        when(dimPlayerRepository.existsById(profileId)).thenReturn(true);
        when(analyticsResponseCache.getOrLoad(any(), any())).thenAnswer(invocation -> {
            java.util.function.Supplier<?> supplier = invocation.getArgument(1);
            return supplier.get();
        });
        when(analyticsRepository.aggregateUnitLosses(
                eq(profileId), eq(null), eq(null), eq(null), eq(null), eq(null), eq(null), eq(null)
        )).thenReturn(List.of(new AnalyticsRepository.UnitLossAggregateRow() {
            @Override
            public String getEntityType() {
                return "Unit";
            }

            @Override
            public Long getPbgid() {
                return 1234L;
            }

            @Override
            public long getLossCount() {
                return 42;
            }

            @Override
            public long getGameCount() {
                return 10;
            }
        }));

        UnitLossStatsView view = analyticsService.getUnitLossStats(AnalyticsFilter.builder(profileId).build());

        assertThat(view.units()).hasSize(1);
        assertThat(view.units().get(0).lossCount()).isEqualTo(42);
    }

    private static FactGamePlayer gamePlayer(long gameId, long profileId, String civ, boolean won) {
        FactGamePlayer gp = new FactGamePlayer();
        gp.setGameId(gameId);
        gp.setProfileId(profileId);
        gp.setCivCode(civ);
        gp.setWon(won);
        gp.setResult(won ? "win" : "loss");
        return gp;
    }

    private static FactGame game(long gameId) {
        FactGame game = new FactGame();
        game.setGameId(gameId);
        game.setStartedAt(Instant.parse("2024-06-01T00:00:00Z"));
        game.setLeaderboardCode("rm_1v1");
        return game;
    }
}
