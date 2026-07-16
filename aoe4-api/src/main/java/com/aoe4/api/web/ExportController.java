package com.aoe4.api.web;

import com.aoe4.analytics.filter.AnalyticsFilter;
import com.aoe4.analytics.service.ExportService;
import com.aoe4.common.dto.AnalyticsViews.MapStatsView;
import com.aoe4.common.dto.AnalyticsViews.MatchupMatrixView;
import com.aoe4.common.dto.AnalyticsViews.PatchStatsView;
import com.aoe4.common.dto.AnalyticsViews.CombatStatsView;
import com.aoe4.common.dto.AnalyticsViews.UnitLossStatsView;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

@RestController
@RequestMapping("/api/v1/export")
public class ExportController {

    private final ExportService exportService;

    public ExportController(ExportService exportService) {
        this.exportService = exportService;
    }

    @GetMapping(value = "/matchup-matrix.csv", produces = "text/csv")
    public ResponseEntity<byte[]> exportMatchupMatrix(@RequestParam long profileId,
                                                      @RequestParam(required = false) String civ,
                                                      @RequestParam(required = false) String opponentCiv,
                                                      @RequestParam(required = false) String leaderboard,
                                                      @RequestParam(required = false) Integer ratingMin,
                                                      @RequestParam(required = false) Integer ratingMax,
                                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        AnalyticsFilter filter = exportFilter(profileId, civ, opponentCiv, leaderboard, null, ratingMin, ratingMax, dateFrom, dateTo);
        String csv = exportService.exportMatchupMatrix(filter);
        return csvAttachment("matchup-" + profileId + ".csv", csv);
    }

    @GetMapping(value = "/matchup-matrix.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<MatchupMatrixView> exportMatchupMatrixJson(@RequestParam long profileId,
                                                                     @RequestParam(required = false) String civ,
                                                                     @RequestParam(required = false) String opponentCiv,
                                                                     @RequestParam(required = false) String leaderboard,
                                                                     @RequestParam(required = false) Integer ratingMin,
                                                                     @RequestParam(required = false) Integer ratingMax,
                                                                     @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                                                     @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        AnalyticsFilter filter = exportFilter(profileId, civ, opponentCiv, leaderboard, null, ratingMin, ratingMax, dateFrom, dateTo);
        MatchupMatrixView body = exportService.exportMatchupMatrixJson(filter);
        return jsonAttachment("matchup-" + profileId + ".json", body);
    }

    @GetMapping(value = "/map-stats.csv", produces = "text/csv")
    public ResponseEntity<byte[]> exportMapStats(@RequestParam long profileId,
                                                 @RequestParam(required = false) String civ,
                                                 @RequestParam(required = false) String leaderboard,
                                                 @RequestParam(required = false) Integer patch,
                                                 @RequestParam(required = false) Integer ratingMin,
                                                 @RequestParam(required = false) Integer ratingMax,
                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        AnalyticsFilter filter = exportFilter(profileId, civ, null, leaderboard, patch, ratingMin, ratingMax, dateFrom, dateTo);
        String csv = exportService.exportMapStats(filter);
        return csvAttachment("map-stats-" + profileId + ".csv", csv);
    }

    @GetMapping(value = "/map-stats.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<MapStatsView> exportMapStatsJson(@RequestParam long profileId,
                                                           @RequestParam(required = false) String civ,
                                                           @RequestParam(required = false) String leaderboard,
                                                           @RequestParam(required = false) Integer patch,
                                                           @RequestParam(required = false) Integer ratingMin,
                                                           @RequestParam(required = false) Integer ratingMax,
                                                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        AnalyticsFilter filter = exportFilter(profileId, civ, null, leaderboard, patch, ratingMin, ratingMax, dateFrom, dateTo);
        MapStatsView body = exportService.exportMapStatsJson(filter);
        return jsonAttachment("map-stats-" + profileId + ".json", body);
    }

    @GetMapping(value = "/patch-stats.csv", produces = "text/csv")
    public ResponseEntity<byte[]> exportPatchStats(@RequestParam long profileId,
                                                   @RequestParam(required = false) String civ,
                                                   @RequestParam(required = false) String leaderboard,
                                                   @RequestParam(required = false) Integer ratingMin,
                                                   @RequestParam(required = false) Integer ratingMax,
                                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        AnalyticsFilter filter = exportFilter(profileId, civ, null, leaderboard, null, ratingMin, ratingMax, dateFrom, dateTo);
        String csv = exportService.exportPatchStats(filter);
        return csvAttachment("patch-stats-" + profileId + ".csv", csv);
    }

    @GetMapping(value = "/patch-stats.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<PatchStatsView> exportPatchStatsJson(@RequestParam long profileId,
                                                               @RequestParam(required = false) String civ,
                                                               @RequestParam(required = false) String leaderboard,
                                                               @RequestParam(required = false) Integer ratingMin,
                                                               @RequestParam(required = false) Integer ratingMax,
                                                               @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                                               @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        AnalyticsFilter filter = exportFilter(profileId, civ, null, leaderboard, null, ratingMin, ratingMax, dateFrom, dateTo);
        PatchStatsView body = exportService.exportPatchStatsJson(filter);
        return jsonAttachment("patch-stats-" + profileId + ".json", body);
    }

    @GetMapping(value = "/combat-stats.csv", produces = "text/csv")
    public ResponseEntity<byte[]> exportCombatStats(@RequestParam long profileId,
                                                    @RequestParam(required = false) String civ,
                                                    @RequestParam(required = false) String leaderboard,
                                                    @RequestParam(required = false) Integer patch,
                                                    @RequestParam(required = false) Integer ratingMin,
                                                    @RequestParam(required = false) Integer ratingMax,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        AnalyticsFilter filter = exportFilter(profileId, civ, null, leaderboard, patch, ratingMin, ratingMax, dateFrom, dateTo);
        String csv = exportService.exportCombatStats(filter);
        return csvAttachment("combat-stats-" + profileId + ".csv", csv);
    }

    @GetMapping(value = "/combat-stats.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<CombatStatsView> exportCombatStatsJson(@RequestParam long profileId,
                                                                 @RequestParam(required = false) String civ,
                                                                 @RequestParam(required = false) String leaderboard,
                                                                 @RequestParam(required = false) Integer patch,
                                                                 @RequestParam(required = false) Integer ratingMin,
                                                                 @RequestParam(required = false) Integer ratingMax,
                                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        AnalyticsFilter filter = exportFilter(profileId, civ, null, leaderboard, patch, ratingMin, ratingMax, dateFrom, dateTo);
        CombatStatsView body = exportService.exportCombatStatsJson(filter);
        return jsonAttachment("combat-stats-" + profileId + ".json", body);
    }

    @GetMapping(value = "/unit-loss-stats.csv", produces = "text/csv")
    public ResponseEntity<byte[]> exportUnitLossStats(@RequestParam long profileId,
                                                      @RequestParam(required = false) String civ,
                                                      @RequestParam(required = false) String leaderboard,
                                                      @RequestParam(required = false) Integer patch,
                                                      @RequestParam(required = false) Integer ratingMin,
                                                      @RequestParam(required = false) Integer ratingMax,
                                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                                      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        AnalyticsFilter filter = exportFilter(profileId, civ, null, leaderboard, patch, ratingMin, ratingMax, dateFrom, dateTo);
        String csv = exportService.exportUnitLossStats(filter);
        return csvAttachment("unit-loss-stats-" + profileId + ".csv", csv);
    }

    @GetMapping(value = "/unit-loss-stats.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<UnitLossStatsView> exportUnitLossStatsJson(@RequestParam long profileId,
                                                                   @RequestParam(required = false) String civ,
                                                                   @RequestParam(required = false) String leaderboard,
                                                                   @RequestParam(required = false) Integer patch,
                                                                   @RequestParam(required = false) Integer ratingMin,
                                                                   @RequestParam(required = false) Integer ratingMax,
                                                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
                                                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo) {
        AnalyticsFilter filter = exportFilter(profileId, civ, null, leaderboard, patch, ratingMin, ratingMax, dateFrom, dateTo);
        UnitLossStatsView body = exportService.exportUnitLossStatsJson(filter);
        return jsonAttachment("unit-loss-stats-" + profileId + ".json", body);
    }

    @GetMapping(value = "/games.csv", produces = "text/csv")
    public ResponseEntity<byte[]> exportGames(@RequestParam long profileId) {
        String csv = exportService.exportGames(profileId);
        return csvAttachment("games-" + profileId + ".csv", csv);
    }

    private static AnalyticsFilter exportFilter(long profileId,
                                              String civ,
                                              String opponentCiv,
                                              String leaderboard,
                                              Integer patch,
                                              Integer ratingMin,
                                              Integer ratingMax,
                                              Instant dateFrom,
                                              Instant dateTo) {
        return AnalyticsFilter.builder(profileId)
                .civCode(civ)
                .opponentCiv(opponentCiv)
                .leaderboard(leaderboard)
                .patchNumber(patch)
                .ratingMin(ratingMin)
                .ratingMax(ratingMax)
                .dateFrom(dateFrom)
                .dateTo(dateTo)
                .build();
    }

    private static ResponseEntity<byte[]> csvAttachment(String filename, String csv) {
        byte[] body = csv.getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(body);
    }

    private static <T> ResponseEntity<T> jsonAttachment(String filename, T body) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
    }
}
