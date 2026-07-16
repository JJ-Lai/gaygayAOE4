package com.aoe4.analytics.service;

import com.aoe4.analytics.cache.AnalyticsResponseCache;
import com.aoe4.analytics.filter.AnalyticsFilter;
import com.aoe4.common.dto.AnalyticsViews.BuildPreferenceRow;
import com.aoe4.common.dto.AnalyticsViews.BuildPreferencesView;
import com.aoe4.common.dto.AnalyticsViews.CivStatRow;
import com.aoe4.common.dto.AnalyticsViews.CivStatsView;
import com.aoe4.common.dto.AnalyticsViews.GameTimelineView;
import com.aoe4.common.dto.AnalyticsViews.MapStatRow;
import com.aoe4.common.dto.AnalyticsViews.MapStatsView;
import com.aoe4.common.dto.AnalyticsViews.MatchupMatrixView;
import com.aoe4.common.dto.AnalyticsViews.MatchupRow;
import com.aoe4.common.dto.AnalyticsViews.MilitaryLossRatioView;
import com.aoe4.common.dto.AnalyticsViews.MilitaryLossRow;
import com.aoe4.common.dto.AnalyticsViews.CombatStatRow;
import com.aoe4.common.dto.AnalyticsViews.CombatStatsView;
import com.aoe4.common.dto.AnalyticsViews.UnitLossRow;
import com.aoe4.common.dto.AnalyticsViews.UnitLossStatsView;
import com.aoe4.common.dto.AnalyticsViews.ModeStatRow;
import com.aoe4.common.dto.AnalyticsViews.ModeStatsView;
import com.aoe4.common.dto.AnalyticsViews.PatchStatRow;
import com.aoe4.common.dto.AnalyticsViews.PatchStatsView;
import com.aoe4.common.dto.AnalyticsViews.PlayerOverviewView;
import com.aoe4.common.dto.AnalyticsViews.RecentTrendPoint;
import com.aoe4.common.dto.AnalyticsViews.ResourceTimelinePoint;
import com.aoe4.common.dto.AnalyticsViews.ResourceTimelineView;
import com.aoe4.common.dto.AnalyticsViews.TimelineOpponentOption;
import com.aoe4.common.dto.AnalyticsViews.TimelineOpponentView;
import com.aoe4.common.dto.AnalyticsViews.TimelineArmyPoint;
import com.aoe4.common.dto.AnalyticsViews.TimelineBuildEvent;
import com.aoe4.common.dto.AnalyticsViews.TimelineMinuteValue;
import com.aoe4.common.dto.AnalyticsViews.TimelineResourceSeries;
import com.aoe4.persistence.entity.DimBuilding;
import com.aoe4.persistence.entity.DimCivilization;
import com.aoe4.persistence.entity.DimTechnology;
import com.aoe4.persistence.entity.DimUnit;
import com.aoe4.persistence.entity.FactBuildEvent;
import com.aoe4.persistence.entity.FactGame;
import com.aoe4.persistence.entity.FactGamePlayer;
import com.aoe4.persistence.entity.FactGamePlayerArmyValue;
import com.aoe4.persistence.entity.FactGamePlayerResource;
import com.aoe4.persistence.repository.AggAnalyticsRepository;
import com.aoe4.persistence.repository.AnalyticsRepository;
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
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class AnalyticsService {

    private final DimPlayerRepository dimPlayerRepository;
    private final FactGamePlayerRepository factGamePlayerRepository;
    private final FactGameRepository factGameRepository;
    private final RawGameSummaryRepository rawGameSummaryRepository;
    private final AnalyticsRepository analyticsRepository;
    private final AggAnalyticsRepository aggAnalyticsRepository;
    private final AnalyticsResponseCache analyticsResponseCache;
    private final FactGamePlayerResourceRepository resourceRepository;
    private final FactGamePlayerArmyValueRepository armyValueRepository;
    private final FactBuildEventRepository buildEventRepository;
    private final DimCivilizationRepository dimCivilizationRepository;
    private final DimUnitRepository dimUnitRepository;
    private final DimBuildingRepository dimBuildingRepository;
    private final DimTechnologyRepository dimTechnologyRepository;

    public AnalyticsService(DimPlayerRepository dimPlayerRepository,
                            FactGamePlayerRepository factGamePlayerRepository,
                            FactGameRepository factGameRepository,
                            RawGameSummaryRepository rawGameSummaryRepository,
                            AnalyticsRepository analyticsRepository,
                            AggAnalyticsRepository aggAnalyticsRepository,
                            AnalyticsResponseCache analyticsResponseCache,
                            FactGamePlayerResourceRepository resourceRepository,
                            FactGamePlayerArmyValueRepository armyValueRepository,
                            FactBuildEventRepository buildEventRepository,
                            DimCivilizationRepository dimCivilizationRepository,
                            DimUnitRepository dimUnitRepository,
                            DimBuildingRepository dimBuildingRepository,
                            DimTechnologyRepository dimTechnologyRepository) {
        this.dimPlayerRepository = dimPlayerRepository;
        this.factGamePlayerRepository = factGamePlayerRepository;
        this.factGameRepository = factGameRepository;
        this.rawGameSummaryRepository = rawGameSummaryRepository;
        this.analyticsRepository = analyticsRepository;
        this.aggAnalyticsRepository = aggAnalyticsRepository;
        this.analyticsResponseCache = analyticsResponseCache;
        this.resourceRepository = resourceRepository;
        this.armyValueRepository = armyValueRepository;
        this.buildEventRepository = buildEventRepository;
        this.dimCivilizationRepository = dimCivilizationRepository;
        this.dimUnitRepository = dimUnitRepository;
        this.dimBuildingRepository = dimBuildingRepository;
        this.dimTechnologyRepository = dimTechnologyRepository;
    }

    public PlayerOverviewView getPlayerOverview(AnalyticsFilter filter) {
        requirePlayer(filter.getProfileId());
        List<FactGamePlayer> games = factGamePlayerRepository.findByProfileId(filter.getProfileId());
        List<FactGamePlayer> filtered = games.stream()
                .filter(gp -> matchesPlayerFilter(gp, filter) && matchesGameFilter(gp.getGameId(), filter))
                .toList();

        long wins = filtered.stream().filter(gp -> Boolean.TRUE.equals(gp.getWon())).count();
        long losses = filtered.size() - wins;
        double winRate = filtered.isEmpty() ? 0.0 : (double) wins / filtered.size();

        String mostPlayedCiv = filtered.stream()
                .filter(gp -> gp.getCivCode() != null)
                .collect(Collectors.groupingBy(FactGamePlayer::getCivCode, Collectors.counting()))
                .entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse(null);

        long gamesWithSummary = rawGameSummaryRepository.countByProfileIdAndFetchStatus(
                filter.getProfileId(), "SUCCESS");

        List<RecentTrendPoint> trend = filtered.stream()
                .sorted(Comparator.comparing((FactGamePlayer gp) ->
                        factGameRepository.findById(gp.getGameId()).map(FactGame::getStartedAt).orElse(null),
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(10)
                .map(gp -> new RecentTrendPoint(
                        factGameRepository.findById(gp.getGameId()).map(FactGame::getStartedAt).orElse(null),
                        gp.getResult(),
                        gp.getCivCode(),
                        gp.getGameId()
                ))
                .toList();

        return new PlayerOverviewView(
                filter.getProfileId(),
                filtered.size(),
                wins,
                losses,
                winRate,
                mostPlayedCiv,
                gamesWithSummary,
                trend
        );
    }

    public CivStatsView getCivStats(AnalyticsFilter filter) {
        requirePlayer(filter.getProfileId());
        return analyticsResponseCache.getOrLoad(cacheKey("civ-stats", filter), () -> {
            List<AnalyticsRepository.CivAggregateRow> rows = loadCivStats(filter);
            List<CivStatRow> civs = rows.stream()
                    .map(row -> new CivStatRow(
                            row.getCivCode(),
                            resolveCivName(row.getCivCode()),
                            row.getGames(),
                            row.getWins(),
                            row.getLosses(),
                            row.getGames() == 0 ? 0.0 : (double) row.getWins() / row.getGames()
                    ))
                    .toList();
            return new CivStatsView(filter.getProfileId(), civs);
        });
    }

    public MapStatsView getMapStats(AnalyticsFilter filter) {
        requirePlayer(filter.getProfileId());
        return analyticsResponseCache.getOrLoad(cacheKey("map-stats", filter), () -> {
            List<MapStatRow> maps = analyticsRepository.aggregateMapStats(
                    filter.getProfileId(),
                    filter.getCivCode(),
                    filter.getLeaderboard(),
                    filter.getPatchNumber(),
                    filter.getDateFrom(),
                    filter.getDateTo(),
                    filter.getRatingMin(),
                    filter.getRatingMax()
            ).stream()
                    .map(row -> new MapStatRow(
                            row.getMapCode(),
                            row.getMapName(),
                            row.getGames(),
                            row.getWins(),
                            row.getLosses(),
                            row.getGames() == 0 ? 0.0 : (double) row.getWins() / row.getGames()
                    ))
                    .toList();
            return new MapStatsView(filter.getProfileId(), maps);
        });
    }

    public PatchStatsView getPatchStats(AnalyticsFilter filter) {
        requirePlayer(filter.getProfileId());
        return analyticsResponseCache.getOrLoad(cacheKey("patch-stats", filter), () -> {
            List<PatchStatRow> patches = analyticsRepository.aggregatePatchStats(
                    filter.getProfileId(),
                    filter.getCivCode(),
                    filter.getLeaderboard(),
                    filter.getDateFrom(),
                    filter.getDateTo(),
                    filter.getRatingMin(),
                    filter.getRatingMax()
            ).stream()
                    .map(row -> new PatchStatRow(
                            row.getPatchCode(),
                            row.getPatchLabel(),
                            row.getGames(),
                            row.getWins(),
                            row.getLosses(),
                            row.getGames() == 0 ? 0.0 : (double) row.getWins() / row.getGames()
                    ))
                    .toList();
            return new PatchStatsView(filter.getProfileId(), patches);
        });
    }

    public ModeStatsView getModeStats(AnalyticsFilter filter) {
        requirePlayer(filter.getProfileId());
        return analyticsResponseCache.getOrLoad(cacheKey("mode-stats", filter), () -> {
            List<ModeStatRow> modes = analyticsRepository.aggregateModeStats(
                    filter.getProfileId(),
                    filter.getCivCode(),
                    filter.getPatchNumber(),
                    filter.getDateFrom(),
                    filter.getDateTo(),
                    filter.getRatingMin(),
                    filter.getRatingMax()
            ).stream()
                    .map(row -> new ModeStatRow(
                            row.getModeCode(),
                            row.getModeName(),
                            row.getGames(),
                            row.getWins(),
                            row.getLosses(),
                            row.getGames() == 0 ? 0.0 : (double) row.getWins() / row.getGames()
                    ))
                    .toList();
            return new ModeStatsView(filter.getProfileId(), modes);
        });
    }

    public CombatStatsView getCombatStats(AnalyticsFilter filter) {
        requirePlayer(filter.getProfileId());
        return analyticsResponseCache.getOrLoad(cacheKey("combat-stats", filter), () -> {
            List<CombatStatRow> civilizations = analyticsRepository.aggregateCombatStats(
                    filter.getProfileId(),
                    filter.getCivCode(),
                    filter.getLeaderboard(),
                    filter.getPatchNumber(),
                    filter.getDateFrom(),
                    filter.getDateTo(),
                    filter.getRatingMin(),
                    filter.getRatingMax()
            ).stream()
                    .map(row -> new CombatStatRow(
                            row.getCivCode(),
                            resolveCivName(row.getCivCode()),
                            row.getGames(),
                            nullToZero(row.getAvgBuildingsLost()),
                            nullToZero(row.getAvgUnitsLost()),
                            nullToZero(row.getAvgUnitKills()),
                            nullToZero(row.getAvgSquadKills()),
                            nullToZero(row.getAvgEnemyDeaths())
                    ))
                    .toList();
            return new CombatStatsView(filter.getProfileId(), civilizations);
        });
    }

    public UnitLossStatsView getUnitLossStats(AnalyticsFilter filter) {
        requirePlayer(filter.getProfileId());
        return analyticsResponseCache.getOrLoad(cacheKey("unit-loss-stats", filter), () -> {
            List<UnitLossRow> units = analyticsRepository.aggregateUnitLosses(
                    filter.getProfileId(),
                    filter.getCivCode(),
                    filter.getLeaderboard(),
                    filter.getPatchNumber(),
                    filter.getDateFrom(),
                    filter.getDateTo(),
                    filter.getRatingMin(),
                    filter.getRatingMax()
            ).stream()
                    .map(row -> new UnitLossRow(
                            row.getEntityType(),
                            row.getPbgid(),
                            resolveEntityName(row.getEntityType(), row.getPbgid()),
                            row.getLossCount(),
                            row.getGameCount()
                    ))
                    .toList();
            return new UnitLossStatsView(filter.getProfileId(), units);
        });
    }

    public ResourceTimelineView getResourceTimeline(AnalyticsFilter filter) {
        requirePlayer(filter.getProfileId());
        return analyticsResponseCache.getOrLoad(cacheKey("resource-timeline", filter), () -> {
            Set<String> resourceFilter = filter.getResources().stream()
                    .map(r -> r.toLowerCase(Locale.ROOT))
                    .collect(Collectors.toSet());

            List<ResourceTimelinePoint> points = loadResourceTimeline(filter).stream()
                    .filter(row -> resourceFilter.isEmpty() || resourceFilter.contains(row.getResource()))
                    .map(row -> new ResourceTimelinePoint(
                            row.getMinute(),
                            row.getResource(),
                            row.getAvgValue() != null ? row.getAvgValue() : 0.0,
                            row.getGameCount()
                    ))
                    .toList();

            return new ResourceTimelineView(filter.getProfileId(), points);
        });
    }

    public MatchupMatrixView getMatchupMatrix(AnalyticsFilter filter) {
        requirePlayer(filter.getProfileId());
        return analyticsResponseCache.getOrLoad(cacheKey("matchup-matrix", filter), () -> {
            List<MatchupRow> matchups = loadMatchups(filter).stream()
                    .map(row -> new MatchupRow(
                            row.getPlayerCiv(),
                            row.getOpponentCiv(),
                            row.getWins(),
                            row.getLosses(),
                            row.getGames() == 0 ? 0.0 : (double) row.getWins() / row.getGames(),
                            row.getAvgMilitaryDiff()
                    ))
                    .toList();
            return new MatchupMatrixView(filter.getProfileId(), matchups);
        });
    }

    public MilitaryLossRatioView getMilitaryLossRatio(AnalyticsFilter filter) {
        requirePlayer(filter.getProfileId());
        if (filter.getCivCode() == null) {
            throw new IllegalArgumentException("playerCiv is required");
        }

        List<MilitaryLossRow> rows = loadMatchups(filter).stream()
                .map(row -> new MilitaryLossRow(
                        row.getOpponentCiv(),
                        row.getGames(),
                        row.getWins(),
                        row.getGames() == 0 ? 0.0 : (double) row.getWins() / row.getGames(),
                        row.getAvgMilitaryDiff()
                ))
                .toList();

        return new MilitaryLossRatioView(filter.getProfileId(), filter.getCivCode(), rows);
    }

    public BuildPreferencesView getBuildPreferences(AnalyticsFilter filter) {
        requirePlayer(filter.getProfileId());
        int minuteFrom = filter.getMinuteFrom() != null ? filter.getMinuteFrom() : 0;
        int minuteTo = filter.getMinuteTo() != null ? filter.getMinuteTo() : 20;

        List<BuildPreferenceRow> items = analyticsRepository.aggregateBuildPreferences(
                        filter.getProfileId(),
                        filter.getCivCode(),
                        filter.getLeaderboard(),
                        minuteFrom,
                        minuteTo,
                        filter.getDateFrom(),
                        filter.getDateTo(),
                        filter.getRatingMin(),
                        filter.getRatingMax()
                ).stream()
                .map(row -> new BuildPreferenceRow(
                        row.getEntityType(),
                        row.getPbgid(),
                        resolveEntityName(row.getEntityType(), row.getPbgid()),
                        row.getEventCount()
                ))
                .toList();

        return new BuildPreferencesView(filter.getProfileId(), minuteFrom, minuteTo, items);
    }

    public GameTimelineView getGameTimeline(long gameId, long profileId) {
        return getGameTimeline(gameId, profileId, null);
    }

    public GameTimelineView getGameTimeline(long gameId, long profileId, Long opponentProfileId) {
        requirePlayer(profileId);
        if (!factGameRepository.existsById(gameId)) {
            throw new GameNotFoundException(gameId);
        }

        List<TimelineResourceSeries> resourceSeries = buildResourceSeries(gameId, profileId);
        List<TimelineArmyPoint> armyValues = buildArmyValues(gameId, profileId);
        List<TimelineBuildEvent> buildEvents = buildBuildEvents(gameId, profileId);
        List<TimelineOpponentOption> availableOpponents = listAvailableOpponents(gameId, profileId);
        TimelineOpponentView opponent = resolveOpponent(gameId, profileId, opponentProfileId, availableOpponents);

        return new GameTimelineView(
                gameId,
                profileId,
                resourceSeries,
                armyValues,
                buildEvents,
                opponent,
                availableOpponents
        );
    }

    private List<TimelineResourceSeries> buildResourceSeries(long gameId, long profileId) {
        List<FactGamePlayerResource> resources = resourceRepository.findByGameIdAndProfileId(gameId, profileId)
                .stream()
                .sorted(Comparator.comparing(FactGamePlayerResource::getResourceCode)
                        .thenComparing(FactGamePlayerResource::getSeriesIndex))
                .toList();

        Map<String, List<TimelineMinuteValue>> resourceGroups = new LinkedHashMap<>();
        for (FactGamePlayerResource resource : resources) {
            resourceGroups.computeIfAbsent(resource.getResourceCode(), k -> new ArrayList<>())
                    .add(new TimelineMinuteValue(
                            resource.getMinuteIndex(),
                            resource.getSecondMark(),
                            resource.getAccumulatedValue(),
                            resource.getPerMinuteValue()
                    ));
        }

        return resourceGroups.entrySet().stream()
                .map(e -> new TimelineResourceSeries(e.getKey(), e.getValue()))
                .toList();
    }

    private List<TimelineArmyPoint> buildArmyValues(long gameId, long profileId) {
        return armyValueRepository.findByGameIdAndProfileId(gameId, profileId)
                .stream()
                .sorted(Comparator.comparing(FactGamePlayerArmyValue::getSeriesIndex))
                .map(v -> new TimelineArmyPoint(v.getMinuteIndex(), v.getSecondMark(), v.getArmyValue()))
                .toList();
    }

    private List<TimelineBuildEvent> buildBuildEvents(long gameId, long profileId) {
        return buildEventRepository.findByGameIdAndProfileId(gameId, profileId)
                .stream()
                .sorted(Comparator.comparing(FactBuildEvent::getEventSecond))
                .map(e -> new TimelineBuildEvent(
                        e.getEventSecond(),
                        e.getEventSecond() / 60,
                        e.getEntityType(),
                        e.getPbgid(),
                        resolveEntityName(e.getEntityType(), e.getPbgid()),
                        e.getEventKind()
                ))
                .toList();
    }

    private List<TimelineOpponentOption> listAvailableOpponents(long gameId, long profileId) {
        Integer viewerTeam = factGamePlayerRepository.findByGameId(gameId).stream()
                .filter(gp -> profileId == gp.getProfileId())
                .map(FactGamePlayer::getTeamIndex)
                .findFirst()
                .orElse(null);

        return factGamePlayerRepository.findByGameId(gameId).stream()
                .filter(gp -> gp.getProfileId() != null && !gp.getProfileId().equals(profileId))
                .map(gp -> toOpponentOption(gameId, gp, viewerTeam))
                .sorted(Comparator
                        .comparing((TimelineOpponentOption o) -> !"opponent".equals(o.relationship()))
                        .thenComparing(TimelineOpponentOption::playerName, Comparator.nullsLast(String::compareToIgnoreCase)))
                .toList();
    }

    private TimelineOpponentOption toOpponentOption(long gameId, FactGamePlayer gp, Integer viewerTeam) {
        long oppId = gp.getProfileId();
        boolean hasTimelineData = hasTimelineData(gameId, oppId);
        String playerName = dimPlayerRepository.findById(oppId)
                .map(p -> p.getName() != null ? p.getName() : String.valueOf(oppId))
                .orElse(String.valueOf(oppId));
        String relationship = resolveRelationship(viewerTeam, gp.getTeamIndex());
        return new TimelineOpponentOption(oppId, playerName, resolveCivName(gp.getCivCode()), hasTimelineData, relationship);
    }

    private static String resolveRelationship(Integer viewerTeam, Integer otherTeam) {
        if (viewerTeam == null || otherTeam == null) {
            return "unknown";
        }
        return viewerTeam.equals(otherTeam) ? "teammate" : "opponent";
    }

    private boolean hasTimelineData(long gameId, long opponentProfileId) {
        return buildOpponentView(gameId, opponentProfileId) != null;
    }

    private TimelineOpponentView resolveOpponent(long gameId,
                                                 long profileId,
                                                 Long opponentProfileId,
                                                 List<TimelineOpponentOption> availableOpponents) {
        if (opponentProfileId != null && !opponentProfileId.equals(profileId)) {
            boolean inGame = availableOpponents.stream()
                    .anyMatch(option -> opponentProfileId.equals(option.profileId()));
            if (inGame) {
                return buildOpponentView(gameId, opponentProfileId);
            }
        }
        return availableOpponents.stream()
                .filter(TimelineOpponentOption::hasTimelineData)
                .filter(option -> "opponent".equals(option.relationship()))
                .findFirst()
                .or(() -> availableOpponents.stream()
                        .filter(TimelineOpponentOption::hasTimelineData)
                        .findFirst())
                .map(option -> buildOpponentView(gameId, option.profileId()))
                .orElse(null);
    }

    private TimelineOpponentView buildOpponentView(long gameId, long opponentProfileId) {
        List<TimelineResourceSeries> resources = buildResourceSeries(gameId, opponentProfileId);
        List<TimelineArmyPoint> armyValues = buildArmyValues(gameId, opponentProfileId);
        List<TimelineBuildEvent> buildEvents = buildBuildEvents(gameId, opponentProfileId);
        if (resources.isEmpty() && armyValues.isEmpty() && buildEvents.isEmpty()) {
            return null;
        }
        FactGamePlayer opponent = factGamePlayerRepository.findByGameId(gameId).stream()
                .filter(gp -> gp.getProfileId() != null && gp.getProfileId() == opponentProfileId)
                .findFirst()
                .orElse(null);
        String playerName = dimPlayerRepository.findById(opponentProfileId)
                .map(p -> p.getName() != null ? p.getName() : String.valueOf(opponentProfileId))
                .orElse(String.valueOf(opponentProfileId));
        String civilization = opponent != null ? resolveCivName(opponent.getCivCode()) : null;
        return new TimelineOpponentView(
                opponentProfileId,
                playerName,
                civilization,
                resources,
                armyValues,
                buildEvents
        );
    }

    private List<AnalyticsRepository.CivAggregateRow> loadCivStats(AnalyticsFilter filter) {
        if (filter.canUseAggregates() && hasAggregates(filter.getProfileId())) {
            List<AnalyticsRepository.CivAggregateRow> rows = aggAnalyticsRepository.findCivStats(
                    filter.getProfileId(),
                    dimensionValue(filter.getLeaderboard())
            );
            if (!rows.isEmpty()) {
                return rows;
            }
        }
        return analyticsRepository.aggregateCivStats(
                filter.getProfileId(),
                filter.getLeaderboard(),
                filter.getDateFrom(),
                filter.getDateTo(),
                filter.getRatingMin(),
                filter.getRatingMax()
        );
    }

    private List<AnalyticsRepository.MatchupAggregateRow> loadMatchups(AnalyticsFilter filter) {
        if (filter.canUseAggregates() && hasAggregates(filter.getProfileId())) {
            List<AnalyticsRepository.MatchupAggregateRow> rows = aggAnalyticsRepository.findMatchups(
                    filter.getProfileId(),
                    dimensionValue(filter.getLeaderboard()),
                    filter.getCivCode(),
                    filter.getOpponentCiv()
            );
            if (!rows.isEmpty()) {
                return rows;
            }
        }
        return analyticsRepository.aggregateMatchups(
                filter.getProfileId(),
                filter.getCivCode(),
                filter.getOpponentCiv(),
                filter.getLeaderboard(),
                filter.getDateFrom(),
                filter.getDateTo(),
                filter.getRatingMin(),
                filter.getRatingMax()
        );
    }

    private List<AnalyticsRepository.ResourceTimelineRow> loadResourceTimeline(AnalyticsFilter filter) {
        if (filter.canUseAggregates()
                && filter.getPatchNumber() == null
                && hasAggregates(filter.getProfileId())) {
            List<AnalyticsRepository.ResourceTimelineRow> rows = aggAnalyticsRepository.findResourceTimeline(
                    filter.getProfileId(),
                    dimensionValue(filter.getLeaderboard()),
                    dimensionValue(filter.getCivCode())
            );
            if (!rows.isEmpty()) {
                return rows;
            }
        }
        return analyticsRepository.aggregateResourceTimeline(
                filter.getProfileId(),
                filter.getCivCode(),
                filter.getLeaderboard(),
                filter.getPatchNumber(),
                filter.getDateFrom(),
                filter.getDateTo(),
                filter.getRatingMin(),
                filter.getRatingMax()
        );
    }

    private boolean hasAggregates(long profileId) {
        return aggAnalyticsRepository.countByProfileId(profileId) > 0;
    }

    private static String dimensionValue(String value) {
        return value != null ? value : AggAnalyticsRepository.ALL_DIMENSION;
    }

    private static String cacheKey(String endpoint, AnalyticsFilter filter) {
        return filter.getProfileId() + ":" + endpoint + ":"
                + nullSafe(filter.getCivCode()) + ":"
                + nullSafe(filter.getOpponentCiv()) + ":"
                + nullSafe(filter.getLeaderboard()) + ":"
                + nullSafe(filter.getPatchNumber()) + ":"
                + nullSafe(filter.getDateFrom()) + ":"
                + nullSafe(filter.getDateTo()) + ":"
                + nullSafe(filter.getRatingMin()) + ":"
                + nullSafe(filter.getRatingMax()) + ":"
                + String.join(",", filter.getResources());
    }

    private static String nullSafe(Object value) {
        return value == null ? "" : value.toString();
    }

    private static double nullToZero(Double value) {
        return value != null ? value : 0.0;
    }

    private void requirePlayer(long profileId) {
        if (!dimPlayerRepository.existsById(profileId)) {
            throw new PlayerNotFoundException(profileId);
        }
    }

    private boolean matchesGameFilter(Long gameId, AnalyticsFilter filter) {
        return factGameRepository.findById(gameId)
                .map(game -> {
                    if (filter.getLeaderboard() != null
                            && !filter.getLeaderboard().equalsIgnoreCase(game.getLeaderboardCode())) {
                        return false;
                    }
                    if (filter.getDateFrom() != null && game.getStartedAt() != null
                            && game.getStartedAt().isBefore(filter.getDateFrom())) {
                        return false;
                    }
                    if (filter.getDateTo() != null && game.getStartedAt() != null
                            && game.getStartedAt().isAfter(filter.getDateTo())) {
                        return false;
                    }
                    if (filter.getPatchNumber() != null
                            && !filter.getPatchNumber().equals(game.getPatchNumber())) {
                        return false;
                    }
                    return true;
                })
                .orElse(false);
    }

    private boolean matchesPlayerFilter(FactGamePlayer gp, AnalyticsFilter filter) {
        if (filter.getCivCode() != null
                && (gp.getCivCode() == null || !filter.getCivCode().equalsIgnoreCase(gp.getCivCode()))) {
            return false;
        }
        if (filter.getRatingMin() != null
                && (gp.getRating() == null || gp.getRating() < filter.getRatingMin())) {
            return false;
        }
        if (filter.getRatingMax() != null
                && (gp.getRating() == null || gp.getRating() > filter.getRatingMax())) {
            return false;
        }
        return true;
    }

    private String resolveCivName(String civCode) {
        if (civCode == null) {
            return null;
        }
        return dimCivilizationRepository.findById(civCode)
                .map(DimCivilization::getCivName)
                .orElse(civCode);
    }

    private String resolveEntityName(String entityType, Long pbgid) {
        if (pbgid == null) {
            return entityType;
        }
        String type = entityType != null ? entityType.toLowerCase(Locale.ROOT) : "";
        return switch (type) {
            case "unit", "animal" -> dimUnitRepository.findById(pbgid).map(DimUnit::getDisplayName).orElse("unit-" + pbgid);
            case "building", "age" -> dimBuildingRepository.findById(pbgid).map(DimBuilding::getDisplayName).orElse("building-" + pbgid);
            case "upgrade" -> dimTechnologyRepository.findById(pbgid).map(DimTechnology::getDisplayName).orElse("upgrade-" + pbgid);
            default -> entityType + "-" + pbgid;
        };
    }
}
