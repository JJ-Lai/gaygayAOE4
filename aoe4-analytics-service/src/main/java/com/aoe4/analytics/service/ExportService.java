package com.aoe4.analytics.service;

import com.aoe4.analytics.export.CsvWriter;
import com.aoe4.analytics.filter.AnalyticsFilter;
import com.aoe4.common.dto.AnalyticsViews.MapStatsView;
import com.aoe4.common.dto.AnalyticsViews.MatchupMatrixView;
import com.aoe4.common.dto.AnalyticsViews.PatchStatsView;
import com.aoe4.common.dto.AnalyticsViews.CombatStatsView;
import com.aoe4.common.dto.AnalyticsViews.UnitLossStatsView;
import org.springframework.stereotype.Service;

@Service
public class ExportService {

    private final AnalyticsService analyticsService;
    private final GameQueryService gameQueryService;

    public ExportService(AnalyticsService analyticsService, GameQueryService gameQueryService) {
        this.analyticsService = analyticsService;
        this.gameQueryService = gameQueryService;
    }

    public String exportMatchupMatrix(AnalyticsFilter filter) {
        MatchupMatrixView view = analyticsService.getMatchupMatrix(filter);
        return CsvWriter.matchupMatrix(view);
    }

    public MatchupMatrixView exportMatchupMatrixJson(AnalyticsFilter filter) {
        return analyticsService.getMatchupMatrix(filter);
    }

    public String exportMapStats(AnalyticsFilter filter) {
        MapStatsView view = analyticsService.getMapStats(filter);
        return CsvWriter.mapStats(view);
    }

    public MapStatsView exportMapStatsJson(AnalyticsFilter filter) {
        return analyticsService.getMapStats(filter);
    }

    public String exportPatchStats(AnalyticsFilter filter) {
        PatchStatsView view = analyticsService.getPatchStats(filter);
        return CsvWriter.patchStats(view);
    }

    public PatchStatsView exportPatchStatsJson(AnalyticsFilter filter) {
        return analyticsService.getPatchStats(filter);
    }

    public String exportCombatStats(AnalyticsFilter filter) {
        CombatStatsView view = analyticsService.getCombatStats(filter);
        return CsvWriter.combatStats(view);
    }

    public CombatStatsView exportCombatStatsJson(AnalyticsFilter filter) {
        return analyticsService.getCombatStats(filter);
    }

    public String exportUnitLossStats(AnalyticsFilter filter) {
        UnitLossStatsView view = analyticsService.getUnitLossStats(filter);
        return CsvWriter.unitLossStats(view);
    }

    public UnitLossStatsView exportUnitLossStatsJson(AnalyticsFilter filter) {
        return analyticsService.getUnitLossStats(filter);
    }

    public String exportGames(long profileId) {
        int size = 5000;
        var page = gameQueryService.listGames(profileId, 0, size);
        return CsvWriter.games(profileId, page);
    }
}
