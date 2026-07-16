package com.aoe4.api.web;

import com.aoe4.analytics.filter.AnalyticsFilter;
import com.aoe4.analytics.service.AnalyticsService;
import com.aoe4.common.dto.AnalyticsViews.BuildPreferencesView;
import com.aoe4.common.dto.AnalyticsViews.CivStatsView;
import com.aoe4.common.dto.AnalyticsViews.MapStatsView;
import com.aoe4.common.dto.AnalyticsViews.CombatStatsView;
import com.aoe4.common.dto.AnalyticsViews.UnitLossStatsView;
import com.aoe4.common.dto.AnalyticsViews.MatchupMatrixView;
import com.aoe4.common.dto.AnalyticsViews.ModeStatsView;
import com.aoe4.common.dto.AnalyticsViews.MilitaryLossRatioView;
import com.aoe4.common.dto.AnalyticsViews.PatchStatsView;
import com.aoe4.common.dto.AnalyticsViews.PlayerOverviewView;
import com.aoe4.common.dto.AnalyticsViews.ResourceTimelineView;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;

@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    @GetMapping("/overview")
    public PlayerOverviewView overview(@RequestParam long profileId,
                                       @RequestParam(required = false) String civ,
                                       @RequestParam(required = false) String leaderboard,
                                       @RequestParam(required = false) Integer patch,
                                       @RequestParam(required = false) Integer ratingMin,
                                       @RequestParam(required = false) Integer ratingMax,
                                       @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                       @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        return analyticsService.getPlayerOverview(dimensionFilter(profileId, civ, null, leaderboard, patch, ratingMin, ratingMax, dateFrom, dateTo).build());
    }

    @GetMapping("/civ-stats")
    public CivStatsView civStats(@RequestParam long profileId,
                                 @RequestParam(required = false) String leaderboard,
                                 @RequestParam(required = false) Integer ratingMin,
                                 @RequestParam(required = false) Integer ratingMax,
                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        return analyticsService.getCivStats(dimensionFilter(profileId, null, null, leaderboard, null, ratingMin, ratingMax, dateFrom, dateTo).build());
    }

    @GetMapping("/map-stats")
    public MapStatsView mapStats(@RequestParam long profileId,
                                 @RequestParam(required = false) String civ,
                                 @RequestParam(required = false) String leaderboard,
                                 @RequestParam(required = false) Integer patch,
                                 @RequestParam(required = false) Integer ratingMin,
                                 @RequestParam(required = false) Integer ratingMax,
                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        return analyticsService.getMapStats(dimensionFilter(profileId, civ, null, leaderboard, patch, ratingMin, ratingMax, dateFrom, dateTo).build());
    }

    @GetMapping("/patch-stats")
    public PatchStatsView patchStats(@RequestParam long profileId,
                                     @RequestParam(required = false) String civ,
                                     @RequestParam(required = false) String leaderboard,
                                     @RequestParam(required = false) Integer ratingMin,
                                     @RequestParam(required = false) Integer ratingMax,
                                     @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                     @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        return analyticsService.getPatchStats(dimensionFilter(profileId, civ, null, leaderboard, null, ratingMin, ratingMax, dateFrom, dateTo).build());
    }

    @GetMapping("/mode-stats")
    public ModeStatsView modeStats(@RequestParam long profileId,
                                   @RequestParam(required = false) String civ,
                                   @RequestParam(required = false) Integer patch,
                                   @RequestParam(required = false) Integer ratingMin,
                                   @RequestParam(required = false) Integer ratingMax,
                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        return analyticsService.getModeStats(dimensionFilter(profileId, civ, null, null, patch, ratingMin, ratingMax, dateFrom, dateTo).build());
    }

    @GetMapping("/combat-stats")
    public CombatStatsView combatStats(@RequestParam long profileId,
                                       @RequestParam(required = false) String civ,
                                       @RequestParam(required = false) String leaderboard,
                                       @RequestParam(required = false) Integer patch,
                                       @RequestParam(required = false) Integer ratingMin,
                                       @RequestParam(required = false) Integer ratingMax,
                                       @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                       @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        return analyticsService.getCombatStats(dimensionFilter(profileId, civ, null, leaderboard, patch, ratingMin, ratingMax, dateFrom, dateTo).build());
    }

    @GetMapping("/unit-loss-stats")
    public UnitLossStatsView unitLossStats(@RequestParam long profileId,
                                           @RequestParam(required = false) String civ,
                                           @RequestParam(required = false) String leaderboard,
                                           @RequestParam(required = false) Integer patch,
                                           @RequestParam(required = false) Integer ratingMin,
                                           @RequestParam(required = false) Integer ratingMax,
                                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        return analyticsService.getUnitLossStats(dimensionFilter(profileId, civ, null, leaderboard, patch, ratingMin, ratingMax, dateFrom, dateTo).build());
    }

    @GetMapping("/resource-timeline")
    public ResourceTimelineView resourceTimeline(@RequestParam long profileId,
                                                 @RequestParam(required = false) String civ,
                                                 @RequestParam(required = false) String resources,
                                                 @RequestParam(required = false) String leaderboard,
                                                 @RequestParam(required = false) Integer patch,
                                                 @RequestParam(required = false) Integer ratingMin,
                                                 @RequestParam(required = false) Integer ratingMax,
                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        return analyticsService.getResourceTimeline(dimensionFilter(profileId, civ, null, leaderboard, patch, ratingMin, ratingMax, dateFrom, dateTo)
                .resources(parseCsv(resources))
                .build());
    }

    @GetMapping("/matchup-matrix")
    public MatchupMatrixView matchupMatrix(@RequestParam long profileId,
                                           @RequestParam(required = false) String civ,
                                           @RequestParam(required = false) String opponentCiv,
                                           @RequestParam(required = false) String leaderboard,
                                           @RequestParam(required = false) Integer ratingMin,
                                           @RequestParam(required = false) Integer ratingMax,
                                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        return analyticsService.getMatchupMatrix(dimensionFilter(profileId, civ, opponentCiv, leaderboard, null, ratingMin, ratingMax, dateFrom, dateTo).build());
    }

    @GetMapping("/military-loss-ratio")
    public MilitaryLossRatioView militaryLossRatio(@RequestParam long profileId,
                                                   @RequestParam String playerCiv,
                                                   @RequestParam(required = false) String opponentCiv,
                                                   @RequestParam(required = false) String leaderboard,
                                                   @RequestParam(required = false) Integer ratingMin,
                                                   @RequestParam(required = false) Integer ratingMax,
                                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        return analyticsService.getMilitaryLossRatio(dimensionFilter(profileId, playerCiv, opponentCiv, leaderboard, null, ratingMin, ratingMax, dateFrom, dateTo).build());
    }

    @GetMapping("/build-preferences")
    public BuildPreferencesView buildPreferences(@RequestParam long profileId,
                                                 @RequestParam(defaultValue = "8") int minuteFrom,
                                                 @RequestParam(defaultValue = "12") int minuteTo,
                                                 @RequestParam(required = false) String civ,
                                                 @RequestParam(required = false) String leaderboard,
                                                 @RequestParam(required = false) Integer ratingMin,
                                                 @RequestParam(required = false) Integer ratingMax,
                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        return analyticsService.getBuildPreferences(dimensionFilter(profileId, civ, null, leaderboard, null, ratingMin, ratingMax, dateFrom, dateTo)
                .minuteFrom(minuteFrom)
                .minuteTo(minuteTo)
                .build());
    }

    private static AnalyticsFilter.Builder dimensionFilter(long profileId,
                                                           String civ,
                                                           String opponentCiv,
                                                           String leaderboard,
                                                           Integer patch,
                                                           Integer ratingMin,
                                                           Integer ratingMax,
                                                           Instant dateFrom,
                                                           Instant dateTo) {
        return baseFilter(profileId)
                .civCode(civ)
                .opponentCiv(opponentCiv)
                .leaderboard(leaderboard)
                .patchNumber(patch)
                .ratingMin(ratingMin)
                .ratingMax(ratingMax)
                .dateFrom(dateFrom)
                .dateTo(dateTo);
    }

    private static AnalyticsFilter.Builder baseFilter(long profileId) {
        return AnalyticsFilter.builder(profileId);
    }

    private static List<String> parseCsv(String csv) {
        if (csv == null || csv.isBlank()) {
            return List.of();
        }
        return Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
