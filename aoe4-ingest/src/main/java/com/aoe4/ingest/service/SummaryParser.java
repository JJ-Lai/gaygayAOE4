package com.aoe4.ingest.service;

import com.aoe4.common.dto.SummaryDtos.BuildOrderItem;
import com.aoe4.common.dto.SummaryDtos.GameSummaryApiResponse;
import com.aoe4.common.dto.SummaryDtos.SummaryPlayer;
import com.aoe4.common.dto.SummaryDtos.SummaryResources;
import com.aoe4.common.dto.SummaryDtos.SummaryScores;
import com.aoe4.common.dto.SummaryDtos.SummaryPlayerStats;
import com.aoe4.persistence.entity.DimBuilding;
import com.aoe4.persistence.entity.DimPlayer;
import com.aoe4.persistence.entity.DimTechnology;
import com.aoe4.persistence.entity.DimUnit;
import com.aoe4.persistence.entity.FactBuildEvent;
import com.aoe4.persistence.entity.FactGamePlayerArmyValue;
import com.aoe4.persistence.entity.FactGamePlayerResource;
import com.aoe4.persistence.entity.FactGamePlayerScore;
import com.aoe4.persistence.entity.FactPlayerCombatStats;
import com.aoe4.persistence.repository.DimPlayerRepository;
import com.aoe4.persistence.repository.DimBuildingRepository;
import com.aoe4.persistence.repository.DimTechnologyRepository;
import com.aoe4.persistence.repository.DimUnitRepository;
import com.aoe4.persistence.repository.FactBuildEventRepository;
import com.aoe4.persistence.repository.FactGamePlayerArmyValueRepository;
import com.aoe4.persistence.repository.FactGamePlayerResourceRepository;
import com.aoe4.persistence.repository.FactGamePlayerScoreRepository;
import com.aoe4.persistence.repository.FactPlayerCombatStatsRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;

@Service
public class SummaryParser {

    private static final Logger log = LoggerFactory.getLogger(SummaryParser.class);

    private static final Map<String, Function<SummaryResources, List<Integer>>> RESOURCE_SERIES = Map.of(
            "food", SummaryResources::food,
            "wood", SummaryResources::wood,
            "gold", SummaryResources::gold,
            "stone", SummaryResources::stone,
            "oliveoil", SummaryResources::oliveoil,
            "total", SummaryResources::total
    );

    private static final Map<String, Function<SummaryResources, List<Integer>>> PER_MIN_SERIES = Map.of(
            "food", SummaryResources::foodPerMin,
            "wood", SummaryResources::woodPerMin,
            "gold", SummaryResources::goldPerMin,
            "stone", SummaryResources::stonePerMin,
            "oliveoil", SummaryResources::oliveoilPerMin
    );

    private final ObjectMapper objectMapper;
    private final FactGamePlayerScoreRepository scoreRepository;
    private final FactPlayerCombatStatsRepository combatStatsRepository;
    private final FactGamePlayerResourceRepository resourceRepository;
    private final FactGamePlayerArmyValueRepository armyValueRepository;
    private final FactBuildEventRepository buildEventRepository;
    private final DimUnitRepository dimUnitRepository;
    private final DimBuildingRepository dimBuildingRepository;
    private final DimTechnologyRepository dimTechnologyRepository;
    private final DimPlayerRepository dimPlayerRepository;

    public SummaryParser(ObjectMapper objectMapper,
                         FactGamePlayerScoreRepository scoreRepository,
                         FactPlayerCombatStatsRepository combatStatsRepository,
                         FactGamePlayerResourceRepository resourceRepository,
                         FactGamePlayerArmyValueRepository armyValueRepository,
                         FactBuildEventRepository buildEventRepository,
                         DimUnitRepository dimUnitRepository,
                         DimBuildingRepository dimBuildingRepository,
                         DimTechnologyRepository dimTechnologyRepository,
                         DimPlayerRepository dimPlayerRepository) {
        this.objectMapper = objectMapper;
        this.scoreRepository = scoreRepository;
        this.combatStatsRepository = combatStatsRepository;
        this.resourceRepository = resourceRepository;
        this.armyValueRepository = armyValueRepository;
        this.buildEventRepository = buildEventRepository;
        this.dimUnitRepository = dimUnitRepository;
        this.dimBuildingRepository = dimBuildingRepository;
        this.dimTechnologyRepository = dimTechnologyRepository;
        this.dimPlayerRepository = dimPlayerRepository;
    }

    public GameSummaryApiResponse parse(String payload) {
        try {
            return objectMapper.readValue(payload, GameSummaryApiResponse.class);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Failed to parse summary JSON", ex);
        }
    }

    @Transactional
    public ParseStats persist(long gameId, String payload) {
        GameSummaryApiResponse summary = parse(payload);
        long resolvedGameId = summary.gameId() != null ? summary.gameId() : gameId;
        Instant now = Instant.now();
        int resourcePoints = 0;
        int buildEvents = 0;
        int playersParsed = 0;

        if (summary.players() == null) {
            return new ParseStats(0, 0, 0);
        }

        for (SummaryPlayer player : summary.players()) {
            if (player.profileId() == null) {
                continue;
            }
            long profileId = player.profileId();
            playersParsed++;
            ensurePlayerExists(player, now);

            resourceRepository.deleteByGameIdAndProfileId(resolvedGameId, profileId);
            armyValueRepository.deleteByGameIdAndProfileId(resolvedGameId, profileId);
            buildEventRepository.deleteByGameIdAndProfileId(resolvedGameId, profileId);
            combatStatsRepository.deleteByGameIdAndProfileId(resolvedGameId, profileId);

            persistScores(resolvedGameId, profileId, player.scores(), now);
            persistCombatStats(resolvedGameId, profileId, player.stats(), now);
            resourcePoints += persistResources(resolvedGameId, profileId, player.resources(), now);
            persistArmyValues(resolvedGameId, profileId, player.resources(), now);
            buildEvents += persistBuildEvents(resolvedGameId, profileId, player.buildOrder(), now);
        }

        return new ParseStats(playersParsed, resourcePoints, buildEvents);
    }

    private void persistScores(long gameId, long profileId, SummaryScores scores, Instant now) {
        if (scores == null) {
            return;
        }
        FactGamePlayerScore entity = scoreRepository.findById(new FactGamePlayerScore.ScoreId(gameId, profileId))
                .orElseGet(FactGamePlayerScore::new);
        entity.setGameId(gameId);
        entity.setProfileId(profileId);
        entity.setTotalScore(scores.total());
        entity.setMilitaryScore(scores.military());
        entity.setEconomyScore(scores.economy());
        entity.setTechnologyScore(scores.technology());
        entity.setSocietyScore(scores.society());
        entity.setCreatedAt(now);
        scoreRepository.save(entity);
    }

    private void persistCombatStats(long gameId, long profileId, SummaryPlayerStats stats, Instant now) {
        if (stats == null) {
            return;
        }
        FactPlayerCombatStats entity = combatStatsRepository
                .findById(new FactPlayerCombatStats.CombatId(gameId, profileId))
                .orElseGet(FactPlayerCombatStats::new);
        entity.setGameId(gameId);
        entity.setProfileId(profileId);
        entity.setBuildingsLost(stats.buildingsLost());
        entity.setUnitsLost(stats.unitsLost());
        entity.setUnitKills(stats.unitKills());
        entity.setSquadKills(stats.squadKills());
        entity.setEnemyDeaths(stats.enemyDeaths());
        entity.setCreatedAt(now);
        combatStatsRepository.save(entity);
    }

    private int persistResources(long gameId, long profileId, SummaryResources resources, Instant now) {
        if (resources == null || resources.timestamps() == null) {
            return 0;
        }
        List<Integer> timestamps = resources.timestamps();
        List<FactGamePlayerResource> rows = new ArrayList<>();

        for (Map.Entry<String, Function<SummaryResources, List<Integer>>> entry : RESOURCE_SERIES.entrySet()) {
            String code = entry.getKey();
            List<Integer> values = entry.getValue().apply(resources);
            List<Integer> perMin = PER_MIN_SERIES.getOrDefault(code, r -> null).apply(resources);
            if (values == null) {
                continue;
            }
            int limit = Math.min(timestamps.size(), values.size());
            for (int i = 0; i < limit; i++) {
                Integer secondMark = timestamps.get(i);
                if (secondMark == null) {
                    continue;
                }
                FactGamePlayerResource row = new FactGamePlayerResource();
                row.setGameId(gameId);
                row.setProfileId(profileId);
                row.setResourceCode(code);
                row.setSeriesIndex(i);
                row.setSecondMark(secondMark);
                row.setMinuteIndex(secondMark / 60);
                row.setAccumulatedValue(values.get(i) != null ? values.get(i) : 0);
                if (perMin != null && i < perMin.size()) {
                    row.setPerMinuteValue(perMin.get(i));
                }
                row.setCreatedAt(now);
                rows.add(row);
            }
        }

        resourceRepository.saveAll(rows);
        return rows.size();
    }

    private void persistArmyValues(long gameId, long profileId, SummaryResources resources, Instant now) {
        if (resources == null || resources.timestamps() == null || resources.military() == null) {
            return;
        }
        List<Integer> timestamps = resources.timestamps();
        List<Integer> military = resources.military();
        int limit = Math.min(timestamps.size(), military.size());
        List<FactGamePlayerArmyValue> rows = new ArrayList<>(limit);
        for (int i = 0; i < limit; i++) {
            Integer secondMark = timestamps.get(i);
            Integer armyValue = military.get(i);
            if (secondMark == null || armyValue == null) {
                continue;
            }
            FactGamePlayerArmyValue row = new FactGamePlayerArmyValue();
            row.setGameId(gameId);
            row.setProfileId(profileId);
            row.setSeriesIndex(i);
            row.setSecondMark(secondMark);
            row.setMinuteIndex(secondMark / 60);
            row.setArmyValue(armyValue);
            row.setCreatedAt(now);
            rows.add(row);
        }
        armyValueRepository.saveAll(rows);
    }

    private int persistBuildEvents(long gameId, long profileId, List<BuildOrderItem> buildOrder, Instant now) {
        if (buildOrder == null || buildOrder.isEmpty()) {
            return 0;
        }
        List<FactBuildEvent> events = new ArrayList<>();
        for (BuildOrderItem item : buildOrder) {
            if (item == null) {
                continue;
            }
            upsertDimObject(item);
            if (item.finished() != null) {
                for (Integer second : item.finished()) {
                    if (second == null) {
                        continue;
                    }
                    events.add(buildEvent(gameId, profileId, second, item, "FINISHED", now));
                }
            }
            if (item.constructed() != null) {
                for (Integer second : item.constructed()) {
                    if (second == null) {
                        continue;
                    }
                    events.add(buildEvent(gameId, profileId, second, item, "CONSTRUCTED", now));
                }
            }
            if (item.destroyed() != null) {
                for (Integer second : item.destroyed()) {
                    if (second == null) {
                        continue;
                    }
                    events.add(buildEvent(gameId, profileId, second, item, "DESTROYED", now));
                }
            }
        }
        buildEventRepository.saveAll(events);
        return events.size();
    }

    private FactBuildEvent buildEvent(long gameId, long profileId, int second, BuildOrderItem item,
                                      String kind, Instant now) {
        FactBuildEvent event = new FactBuildEvent();
        event.setGameId(gameId);
        event.setProfileId(profileId);
        event.setEventSecond(second);
        event.setEntityType(item.type() != null ? item.type() : "Unknown");
        event.setPbgid(item.pbgid());
        event.setEventKind(kind);
        event.setCreatedAt(now);
        return event;
    }

    private void ensurePlayerExists(SummaryPlayer player, Instant now) {
        if (dimPlayerRepository.existsById(player.profileId())) {
            return;
        }
        DimPlayer entity = new DimPlayer();
        entity.setProfileId(player.profileId());
        entity.setName(player.name());
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);
        entity.setLastSeenAt(now);
        dimPlayerRepository.save(entity);
    }

    private void upsertDimObject(BuildOrderItem item) {
        if (item.pbgid() == null) {
            return;
        }
        String type = item.type() != null ? item.type().toLowerCase(Locale.ROOT) : "";
        String displayName = deriveDisplayName(item.icon());
        Instant now = Instant.now();

        switch (type) {
            case "unit", "animal" -> {
                DimUnit unit = dimUnitRepository.findById(item.pbgid()).orElseGet(DimUnit::new);
                unit.setPbgid(item.pbgid());
                unit.setEntityType(item.type());
                unit.setIcon(item.icon());
                if (unit.getDisplayName() == null) {
                    unit.setDisplayName(displayName);
                }
                unit.setCreatedAt(unit.getCreatedAt() != null ? unit.getCreatedAt() : now);
                dimUnitRepository.save(unit);
            }
            case "building", "age" -> {
                DimBuilding building = dimBuildingRepository.findById(item.pbgid()).orElseGet(DimBuilding::new);
                building.setPbgid(item.pbgid());
                building.setEntityType(item.type());
                building.setIcon(item.icon());
                if (building.getDisplayName() == null) {
                    building.setDisplayName(displayName);
                }
                building.setCreatedAt(building.getCreatedAt() != null ? building.getCreatedAt() : now);
                dimBuildingRepository.save(building);
            }
            case "upgrade" -> {
                DimTechnology tech = dimTechnologyRepository.findById(item.pbgid()).orElseGet(DimTechnology::new);
                tech.setPbgid(item.pbgid());
                tech.setEntityType(item.type());
                tech.setIcon(item.icon());
                if (tech.getDisplayName() == null) {
                    tech.setDisplayName(displayName);
                }
                tech.setCreatedAt(tech.getCreatedAt() != null ? tech.getCreatedAt() : now);
                dimTechnologyRepository.save(tech);
            }
            default -> log.debug("Skipping dim upsert for type {} pbgid {}", item.type(), item.pbgid());
        }
    }

    private static String deriveDisplayName(String icon) {
        if (icon == null || icon.isBlank()) {
            return "unknown";
        }
        String normalized = icon.replace('\\', '/');
        int slash = normalized.lastIndexOf('/');
        String file = slash >= 0 ? normalized.substring(slash + 1) : normalized;
        int dot = file.lastIndexOf('.');
        return dot >= 0 ? file.substring(0, dot) : file;
    }

    public record ParseStats(int playersParsed, int resourceDataPoints, int buildEvents) {
    }
}
