package com.aoe4.analytics.service;

import com.aoe4.common.dto.ApiViews.GameCombatStatsSnapshot;
import com.aoe4.common.dto.ApiViews.GameDetailView;
import com.aoe4.common.dto.ApiViews.GamePageView;
import com.aoe4.common.dto.ApiViews.GamePlayerView;
import com.aoe4.common.dto.ApiViews.GameView;
import com.aoe4.common.dto.ApiViews.PlayerSyncStatusView;
import com.aoe4.persistence.entity.DimMap;
import com.aoe4.persistence.entity.FactGame;
import com.aoe4.persistence.entity.FactGamePlayer;
import com.aoe4.persistence.entity.FactPlayerCombatStats;
import com.aoe4.persistence.entity.RawGameSummary;
import com.aoe4.persistence.repository.DimMapRepository;
import com.aoe4.persistence.repository.DimPlayerRepository;
import com.aoe4.persistence.repository.FactBuildEventRepository;
import com.aoe4.persistence.repository.FactGamePlayerRepository;
import com.aoe4.persistence.repository.FactGamePlayerResourceRepository;
import com.aoe4.persistence.repository.FactGameRepository;
import com.aoe4.persistence.repository.FactPlayerCombatStatsRepository;
import com.aoe4.persistence.repository.RawGameSummaryRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class GameQueryService {

    private final FactGameRepository factGameRepository;
    private final FactGamePlayerRepository factGamePlayerRepository;
    private final DimMapRepository dimMapRepository;
    private final DimPlayerRepository dimPlayerRepository;
    private final RawGameSummaryRepository rawGameSummaryRepository;
    private final FactGamePlayerResourceRepository resourceRepository;
    private final FactBuildEventRepository buildEventRepository;
    private final FactPlayerCombatStatsRepository combatStatsRepository;

    public GameQueryService(FactGameRepository factGameRepository,
                            FactGamePlayerRepository factGamePlayerRepository,
                            DimMapRepository dimMapRepository,
                            DimPlayerRepository dimPlayerRepository,
                            RawGameSummaryRepository rawGameSummaryRepository,
                            FactGamePlayerResourceRepository resourceRepository,
                            FactBuildEventRepository buildEventRepository,
                            FactPlayerCombatStatsRepository combatStatsRepository) {
        this.factGameRepository = factGameRepository;
        this.factGamePlayerRepository = factGamePlayerRepository;
        this.dimMapRepository = dimMapRepository;
        this.dimPlayerRepository = dimPlayerRepository;
        this.rawGameSummaryRepository = rawGameSummaryRepository;
        this.resourceRepository = resourceRepository;
        this.buildEventRepository = buildEventRepository;
        this.combatStatsRepository = combatStatsRepository;
    }

    public GamePageView listGames(long profileId, int page, int size) {
        if (!dimPlayerRepository.existsById(profileId)) {
            throw new PlayerNotFoundException(profileId);
        }
        Page<FactGame> gamePage = factGameRepository.findByProfileId(profileId, PageRequest.of(page, size));
        List<GameView> games = gamePage.getContent().stream()
                .map(this::toGameView)
                .toList();
        return new GamePageView(gamePage.getTotalElements(), page, size, games);
    }

    public PlayerSyncStatusView getSyncStatus(long profileId) {
        if (!dimPlayerRepository.existsById(profileId)) {
            throw new PlayerNotFoundException(profileId);
        }
        long totalGames = factGameRepository.countByProfileId(profileId);
        long synced = rawGameSummaryRepository.countByProfileIdAndFetchStatus(profileId, "SUCCESS");
        long failed = rawGameSummaryRepository.countByProfileIdAndFetchStatus(profileId, "FAILED")
                + rawGameSummaryRepository.countByProfileIdAndFetchStatus(profileId, "NOT_FOUND")
                + rawGameSummaryRepository.countByProfileIdAndFetchStatus(profileId, "RATE_LIMITED")
                + rawGameSummaryRepository.countByProfileIdAndFetchStatus(profileId, "PARSE_FAILED");
        long pending = Math.max(0, totalGames - synced - failed);
        return new PlayerSyncStatusView(profileId, totalGames, synced, pending, failed, Instant.now());
    }

    public GameDetailView getGameDetail(long gameId, long profileId) {
        if (!dimPlayerRepository.existsById(profileId)) {
            throw new PlayerNotFoundException(profileId);
        }
        FactGame game = factGameRepository.findById(gameId)
                .orElseThrow(() -> new GameNotFoundException(gameId));
        RawGameSummary summary = rawGameSummaryRepository.findById(gameId).orElse(null);
        boolean playerInGame = factGamePlayerRepository.findByGameId(gameId).stream()
                .anyMatch(gp -> gp.getProfileId().equals(profileId));
        boolean hasSummaryForProfile = summary != null
                && profileId == summary.getProfileId()
                && "SUCCESS".equals(summary.getFetchStatus());
        if (!playerInGame && !hasSummaryForProfile) {
            throw new GameNotFoundException(gameId);
        }

        boolean hasSummary = summary != null && "SUCCESS".equals(summary.getFetchStatus());
        Integer resourcePoints = hasSummary
                ? (int) resourceRepository.countByGameIdAndProfileId(gameId, profileId)
                : null;
        Integer buildEvents = hasSummary
                ? (int) buildEventRepository.countByGameIdAndProfileId(gameId, profileId)
                : null;
        GameCombatStatsSnapshot combatStats = combatStatsRepository
                .findById(new FactPlayerCombatStats.CombatId(gameId, profileId))
                .map(this::toCombatSnapshot)
                .orElse(null);

        return new GameDetailView(
                toGameView(game),
                hasSummary,
                summary != null ? summary.getFetchStatus() : null,
                summary != null ? summary.getFetchedAt() : null,
                resourcePoints,
                buildEvents,
                combatStats
        );
    }

    private GameCombatStatsSnapshot toCombatSnapshot(FactPlayerCombatStats stats) {
        return new GameCombatStatsSnapshot(
                stats.getBuildingsLost(),
                stats.getUnitsLost(),
                stats.getUnitKills(),
                stats.getSquadKills(),
                stats.getEnemyDeaths()
        );
    }

    private GameView toGameView(FactGame game) {
        String mapName = null;
        if (game.getMapId() != null) {
            mapName = dimMapRepository.findById(game.getMapId()).map(DimMap::getMapName).orElse(null);
        }
        List<FactGamePlayer> players = factGamePlayerRepository.findByGameId(game.getGameId());
        Map<Long, String> names = dimPlayerRepository.findAllById(
                players.stream().map(FactGamePlayer::getProfileId).collect(Collectors.toSet())
        ).stream().collect(Collectors.toMap(
                p -> p.getProfileId(),
                p -> p.getName() != null ? p.getName() : String.valueOf(p.getProfileId())
        ));

        List<GamePlayerView> playerViews = new ArrayList<>();
        for (FactGamePlayer gp : players) {
            playerViews.add(new GamePlayerView(
                    gp.getProfileId(),
                    names.get(gp.getProfileId()),
                    gp.getCivCode(),
                    gp.getResult(),
                    gp.getTeamIndex(),
                    gp.getRating(),
                    gp.getRatingDiff()
            ));
        }

        return new GameView(
                game.getGameId(),
                game.getStartedAt(),
                game.getUpdatedAt(),
                game.getDurationSeconds(),
                mapName,
                game.getLeaderboardCode(),
                game.getKind(),
                game.getPatchNumber(),
                game.getServer(),
                playerViews
        );
    }
}
