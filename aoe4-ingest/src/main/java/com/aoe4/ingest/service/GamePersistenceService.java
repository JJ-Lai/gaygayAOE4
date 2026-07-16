package com.aoe4.ingest.service;

import com.aoe4.common.dto.Aoe4WorldDtos.GameApiResponse;
import com.aoe4.common.dto.Aoe4WorldDtos.GamePlayerApiResponse;
import com.aoe4.common.dto.Aoe4WorldDtos.PlayerApiResponse;
import com.aoe4.common.dto.Aoe4WorldDtos.TeamSlotApiResponse;
import com.aoe4.persistence.entity.DimCivilization;
import com.aoe4.persistence.entity.DimLeaderboard;
import com.aoe4.persistence.entity.DimMap;
import com.aoe4.persistence.entity.DimPatch;
import com.aoe4.persistence.entity.DimPlayer;
import com.aoe4.persistence.entity.FactGame;
import com.aoe4.persistence.entity.FactGamePlayer;
import com.aoe4.persistence.repository.DimCivilizationRepository;
import com.aoe4.persistence.repository.DimLeaderboardRepository;
import com.aoe4.persistence.repository.DimMapRepository;
import com.aoe4.persistence.repository.DimPatchRepository;
import com.aoe4.persistence.repository.DimPlayerRepository;
import com.aoe4.persistence.repository.FactGamePlayerRepository;
import com.aoe4.persistence.repository.FactGameRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
public class GamePersistenceService {

    private final DimPlayerRepository dimPlayerRepository;
    private final DimMapRepository dimMapRepository;
    private final DimLeaderboardRepository dimLeaderboardRepository;
    private final DimPatchRepository dimPatchRepository;
    private final DimCivilizationRepository dimCivilizationRepository;
    private final FactGameRepository factGameRepository;
    private final FactGamePlayerRepository factGamePlayerRepository;

    public GamePersistenceService(DimPlayerRepository dimPlayerRepository,
                                  DimMapRepository dimMapRepository,
                                  DimLeaderboardRepository dimLeaderboardRepository,
                                  DimPatchRepository dimPatchRepository,
                                  DimCivilizationRepository dimCivilizationRepository,
                                  FactGameRepository factGameRepository,
                                  FactGamePlayerRepository factGamePlayerRepository) {
        this.dimPlayerRepository = dimPlayerRepository;
        this.dimMapRepository = dimMapRepository;
        this.dimLeaderboardRepository = dimLeaderboardRepository;
        this.dimPatchRepository = dimPatchRepository;
        this.dimCivilizationRepository = dimCivilizationRepository;
        this.factGameRepository = factGameRepository;
        this.factGamePlayerRepository = factGamePlayerRepository;
    }

    @Transactional
    public void upsertPlayer(PlayerApiResponse player) {
        if (player == null || player.profileId() == null) {
            return;
        }
        Instant now = Instant.now();
        DimPlayer entity = dimPlayerRepository.findById(player.profileId()).orElseGet(DimPlayer::new);
        entity.setProfileId(player.profileId());
        entity.setName(player.name());
        entity.setCountry(player.country());
        entity.setSteamId(player.steamId());
        entity.setLastSeenAt(now);
        if (entity.getCreatedAt() == null) {
            entity.setCreatedAt(now);
        }
        entity.setUpdatedAt(now);
        dimPlayerRepository.save(entity);
    }

    @Transactional
    public void upsertPlayerFromGame(GamePlayerApiResponse player) {
        if (player == null || player.profileId() == null) {
            return;
        }
        Instant now = Instant.now();
        DimPlayer entity = dimPlayerRepository.findById(player.profileId()).orElseGet(DimPlayer::new);
        entity.setProfileId(player.profileId());
        if (player.name() != null) {
            entity.setName(player.name());
        }
        if (player.country() != null) {
            entity.setCountry(player.country());
        }
        entity.setLastSeenAt(now);
        if (entity.getCreatedAt() == null) {
            entity.setCreatedAt(now);
        }
        entity.setUpdatedAt(now);
        dimPlayerRepository.save(entity);
    }

    @Transactional
    public void upsertGame(GameApiResponse game) {
        if (game == null || game.gameId() == null) {
            return;
        }
        Instant now = Instant.now();
        Long mapId = resolveMapId(game.map());
        String leaderboardCode = resolveLeaderboard(game.leaderboard(), game.kind());
        Integer patchNumber = resolvePatch(game.patch());

        FactGame entity = factGameRepository.findById(game.gameId()).orElseGet(FactGame::new);
        entity.setGameId(game.gameId());
        entity.setStartedAt(game.startedAt());
        entity.setUpdatedAt(game.updatedAt());
        entity.setDurationSeconds(game.duration());
        entity.setMapId(mapId);
        entity.setLeaderboardCode(leaderboardCode);
        entity.setKind(game.kind());
        entity.setPatchNumber(patchNumber);
        entity.setServer(game.server());
        entity.setSeason(game.season());
        entity.setOngoing(Boolean.TRUE.equals(game.ongoing()));
        if (entity.getCreatedAt() == null) {
            entity.setCreatedAt(now);
        }
        entity.setUpdatedAtRow(now);
        factGameRepository.save(entity);

        if (game.teams() != null) {
            for (int teamIndex = 0; teamIndex < game.teams().size(); teamIndex++) {
                List<TeamSlotApiResponse> team = game.teams().get(teamIndex);
                if (team == null) {
                    continue;
                }
                for (TeamSlotApiResponse slot : team) {
                    if (slot == null || slot.player() == null) {
                        continue;
                    }
                    upsertPlayerFromGame(slot.player());
                    upsertGamePlayer(game.gameId(), slot.player(), teamIndex);
                }
            }
        }
    }

    private void upsertGamePlayer(Long gameId, GamePlayerApiResponse player, int teamIndex) {
        String civCode = resolveCivilization(player.civilization());
        Instant now = Instant.now();
        FactGamePlayer.GamePlayerId id = new FactGamePlayer.GamePlayerId(gameId, player.profileId());
        FactGamePlayer entity = factGamePlayerRepository.findById(id).orElseGet(FactGamePlayer::new);
        entity.setGameId(gameId);
        entity.setProfileId(player.profileId());
        entity.setCivCode(civCode);
        entity.setTeamIndex(teamIndex);
        entity.setResult(player.result());
        entity.setRating(player.rating());
        entity.setRatingDiff(player.ratingDiff());
        entity.setMmr(player.mmr());
        entity.setMmrDiff(player.mmrDiff());
        entity.setWon("win".equalsIgnoreCase(player.result()));
        if (entity.getCreatedAt() == null) {
            entity.setCreatedAt(now);
        }
        entity.setUpdatedAt(now);
        factGamePlayerRepository.save(entity);
    }

    private Long resolveMapId(String mapName) {
        if (mapName == null || mapName.isBlank()) {
            return null;
        }
        return dimMapRepository.findByMapName(mapName)
                .map(DimMap::getMapId)
                .orElseGet(() -> {
                    DimMap map = new DimMap();
                    map.setMapName(mapName);
                    map.setCreatedAt(Instant.now());
                    return dimMapRepository.save(map).getMapId();
                });
    }

    private String resolveLeaderboard(String leaderboard, String kind) {
        String code = leaderboard != null && !leaderboard.isBlank() ? leaderboard : kind;
        if (code == null || code.isBlank()) {
            return null;
        }
        if (!dimLeaderboardRepository.existsById(code)) {
            DimLeaderboard lb = new DimLeaderboard();
            lb.setLeaderboardCode(code);
            lb.setDisplayName(code);
            lb.setCreatedAt(Instant.now());
            dimLeaderboardRepository.save(lb);
        }
        return code;
    }

    private Integer resolvePatch(Integer patchNumber) {
        if (patchNumber == null) {
            return null;
        }
        if (!dimPatchRepository.existsById(patchNumber)) {
            DimPatch patch = new DimPatch();
            patch.setPatchNumber(patchNumber);
            patch.setCreatedAt(Instant.now());
            dimPatchRepository.save(patch);
        }
        return patchNumber;
    }

    private String resolveCivilization(String civilization) {
        if (civilization == null || civilization.isBlank()) {
            return null;
        }
        if (!dimCivilizationRepository.existsById(civilization)) {
            DimCivilization civ = new DimCivilization();
            civ.setCivCode(civilization);
            civ.setCivName(civilization);
            civ.setCreatedAt(Instant.now());
            dimCivilizationRepository.save(civ);
        }
        return civilization;
    }
}
