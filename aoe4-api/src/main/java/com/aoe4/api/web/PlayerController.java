package com.aoe4.api.web;

import com.aoe4.analytics.service.AggregationRefreshService;
import com.aoe4.analytics.service.AnalyticsService;
import com.aoe4.analytics.service.GameQueryService;
import com.aoe4.analytics.service.PlayerNotFoundException;
import com.aoe4.analytics.service.PlayerQueryService;
import com.aoe4.common.dto.AnalyticsViews.GameTimelineView;
import com.aoe4.common.dto.ApiViews.GameDetailView;
import com.aoe4.common.dto.ApiViews.GamePageView;
import com.aoe4.common.dto.ApiViews.PlayerSearchHitView;
import com.aoe4.common.dto.ApiViews.PlayerSearchResultView;
import com.aoe4.common.dto.ApiViews.PlayerSyncStatusView;
import com.aoe4.common.dto.ApiViews.PlayerView;
import com.aoe4.common.dto.ApiViews.SummarySyncResultView;
import com.aoe4.common.dto.ApiViews.SyncResultView;
import com.aoe4.ingest.client.Aoe4WorldClient;
import com.aoe4.ingest.service.GamePersistenceService;
import com.aoe4.ingest.service.GameSyncService;
import com.aoe4.ingest.service.SummarySyncService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class PlayerController {

    private final PlayerQueryService playerQueryService;
    private final GameQueryService gameQueryService;
    private final GameSyncService gameSyncService;
    private final SummarySyncService summarySyncService;
    private final Aoe4WorldClient aoe4WorldClient;
    private final GamePersistenceService gamePersistenceService;
    private final AnalyticsService analyticsService;
    private final AggregationRefreshService aggregationRefreshService;

    public PlayerController(PlayerQueryService playerQueryService,
                            GameQueryService gameQueryService,
                            GameSyncService gameSyncService,
                            SummarySyncService summarySyncService,
                            Aoe4WorldClient aoe4WorldClient,
                            GamePersistenceService gamePersistenceService,
                            AnalyticsService analyticsService,
                            AggregationRefreshService aggregationRefreshService) {
        this.playerQueryService = playerQueryService;
        this.gameQueryService = gameQueryService;
        this.gameSyncService = gameSyncService;
        this.summarySyncService = summarySyncService;
        this.aoe4WorldClient = aoe4WorldClient;
        this.gamePersistenceService = gamePersistenceService;
        this.analyticsService = analyticsService;
        this.aggregationRefreshService = aggregationRefreshService;
    }

    @GetMapping("/players/search")
    public PlayerSearchResultView searchPlayers(
            @RequestParam String query,
            @RequestParam(defaultValue = "10") int limit) {
        if (query == null || query.isBlank()) {
            return new PlayerSearchResultView(0, List.of());
        }
        int cappedLimit = Math.min(Math.max(limit, 1), 20);
        var response = aoe4WorldClient.searchPlayers(query.trim(), cappedLimit);
        var players = response.players() == null ? List.<PlayerSearchHitView>of()
                : response.players().stream()
                .map(hit -> new PlayerSearchHitView(hit.profileId(), hit.name(), hit.country()))
                .toList();
        int total = response.totalCount() != null ? response.totalCount() : players.size();
        return new PlayerSearchResultView(total, players);
    }

    @GetMapping("/players/{profileId:\\d+}")
    public PlayerView getPlayer(@PathVariable long profileId) {
        try {
            return playerQueryService.findPlayer(profileId);
        } catch (PlayerNotFoundException ex) {
            var remote = aoe4WorldClient.getPlayer(profileId);
            gamePersistenceService.upsertPlayer(remote);
            return new PlayerView(remote.profileId(), remote.name(), remote.country(), remote.steamId());
        }
    }

    @PostMapping("/players/{profileId:\\d+}/sync")
    public SyncResultView syncPlayer(@PathVariable long profileId) {
        SyncResultView result = gameSyncService.syncPlayer(profileId);
        summarySyncService.syncPendingForProfile(profileId);
        aggregationRefreshService.refreshProfile(profileId);
        return result;
    }

    @PostMapping("/players/{profileId:\\d+}/refresh-aggregates")
    public void refreshAggregates(@PathVariable long profileId) {
        aggregationRefreshService.refreshProfile(profileId);
    }

    @PostMapping("/players/{profileId:\\d+}/sync-summaries")
    public SummarySyncResultView syncSummaries(@PathVariable long profileId,
                                               @RequestParam(required = false) Integer maxGames) {
        if (maxGames != null) {
            return summarySyncService.syncPendingForProfile(profileId, maxGames);
        }
        return summarySyncService.syncPendingForProfile(profileId);
    }

    @GetMapping("/players/{profileId}/sync-status")
    public PlayerSyncStatusView syncStatus(@PathVariable long profileId) {
        return gameQueryService.getSyncStatus(profileId);
    }

    @GetMapping("/games")
    public GamePageView listGames(@RequestParam long profileId,
                                  @RequestParam(defaultValue = "0") int page,
                                  @RequestParam(defaultValue = "20") int size) {
        return gameQueryService.listGames(profileId, page, size);
    }

    @GetMapping("/games/{gameId}")
    public GameDetailView getGame(@PathVariable long gameId, @RequestParam long profileId) {
        return gameQueryService.getGameDetail(gameId, profileId);
    }

    @GetMapping("/games/{gameId}/timeline")
    public GameTimelineView getGameTimeline(@PathVariable long gameId,
                                            @RequestParam long profileId,
                                            @RequestParam(required = false) Long opponentProfileId) {
        return analyticsService.getGameTimeline(gameId, profileId, opponentProfileId);
    }

    @PostMapping("/games/{gameId}/sync-summary")
    public SummarySyncResultView syncGameSummary(@PathVariable long gameId, @RequestParam long profileId) {
        gamePersistenceService.upsertGame(aoe4WorldClient.getGame(gameId));
        boolean success = summarySyncService.syncSingleGame(profileId, gameId);
        return new SummarySyncResultView(profileId, 1, success ? 1 : 0, success ? 0 : 1, java.time.Instant.now());
    }
}
