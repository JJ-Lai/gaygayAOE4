package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.FactGamePlayer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface AnalyticsRepository extends JpaRepository<FactGamePlayer, FactGamePlayer.GamePlayerId> {

    @Query("""
            SELECT gp.civCode AS civCode,
                   COUNT(gp) AS games,
                   SUM(CASE WHEN gp.won = TRUE THEN 1 ELSE 0 END) AS wins,
                   SUM(CASE WHEN gp.won = FALSE OR gp.won IS NULL THEN 1 ELSE 0 END) AS losses
            FROM FactGamePlayer gp
            JOIN FactGame g ON g.gameId = gp.gameId
            WHERE gp.profileId = :profileId
              AND (:leaderboard IS NULL OR g.leaderboardCode = :leaderboard)
              AND (:dateFrom IS NULL OR g.startedAt >= :dateFrom)
              AND (:dateTo IS NULL OR g.startedAt <= :dateTo)
              AND (:ratingMin IS NULL OR gp.rating >= :ratingMin)
              AND (:ratingMax IS NULL OR gp.rating <= :ratingMax)
            GROUP BY gp.civCode
            ORDER BY COUNT(gp) DESC
            """)
    List<CivAggregateRow> aggregateCivStats(@Param("profileId") long profileId,
                                              @Param("leaderboard") String leaderboard,
                                              @Param("dateFrom") Instant dateFrom,
                                              @Param("dateTo") Instant dateTo,
                                              @Param("ratingMin") Integer ratingMin,
                                              @Param("ratingMax") Integer ratingMax);

    @Query("""
            SELECT gp.civCode AS playerCiv,
                   opp.civCode AS opponentCiv,
                   COUNT(gp) AS games,
                   SUM(CASE WHEN gp.won = TRUE THEN 1 ELSE 0 END) AS wins,
                   SUM(CASE WHEN gp.won = FALSE OR gp.won IS NULL THEN 1 ELSE 0 END) AS losses,
                   AVG(CAST(s.militaryScore AS double) - CAST(os.militaryScore AS double)) AS avgMilitaryDiff
            FROM FactGamePlayer gp
            JOIN FactGame g ON g.gameId = gp.gameId
            JOIN FactGamePlayer opp ON opp.gameId = gp.gameId AND opp.profileId <> gp.profileId
            LEFT JOIN FactGamePlayerScore s ON s.gameId = gp.gameId AND s.profileId = gp.profileId
            LEFT JOIN FactGamePlayerScore os ON os.gameId = opp.gameId AND os.profileId = opp.profileId
            WHERE gp.profileId = :profileId
              AND opp.civCode IS NOT NULL
              AND (:playerCiv IS NULL OR gp.civCode = :playerCiv)
              AND (:opponentCiv IS NULL OR opp.civCode = :opponentCiv)
              AND (:leaderboard IS NULL OR g.leaderboardCode = :leaderboard)
              AND (:dateFrom IS NULL OR g.startedAt >= :dateFrom)
              AND (:dateTo IS NULL OR g.startedAt <= :dateTo)
              AND (:ratingMin IS NULL OR gp.rating >= :ratingMin)
              AND (:ratingMax IS NULL OR gp.rating <= :ratingMax)
            GROUP BY gp.civCode, opp.civCode
            ORDER BY COUNT(gp) DESC
            """)
    List<MatchupAggregateRow> aggregateMatchups(@Param("profileId") long profileId,
                                              @Param("playerCiv") String playerCiv,
                                              @Param("opponentCiv") String opponentCiv,
                                              @Param("leaderboard") String leaderboard,
                                              @Param("dateFrom") Instant dateFrom,
                                              @Param("dateTo") Instant dateTo,
                                              @Param("ratingMin") Integer ratingMin,
                                              @Param("ratingMax") Integer ratingMax);

    @Query("""
            SELECT r.minuteIndex AS minute,
                   r.resourceCode AS resource,
                   AVG(r.accumulatedValue) AS avgValue,
                   COUNT(DISTINCT r.gameId) AS gameCount
            FROM FactGamePlayerResource r
            JOIN FactGame g ON g.gameId = r.gameId
            LEFT JOIN FactGamePlayer gp ON gp.gameId = r.gameId AND gp.profileId = r.profileId
            JOIN RawGameSummary rs ON rs.gameId = r.gameId AND rs.fetchStatus = 'SUCCESS'
            WHERE r.profileId = :profileId
              AND (:civCode IS NULL OR gp.civCode = :civCode)
              AND (:leaderboard IS NULL OR g.leaderboardCode = :leaderboard)
              AND (:patchNumber IS NULL OR g.patchNumber = :patchNumber)
              AND (:dateFrom IS NULL OR g.startedAt >= :dateFrom)
              AND (:dateTo IS NULL OR g.startedAt <= :dateTo)
              AND (:ratingMin IS NULL OR gp.rating >= :ratingMin)
              AND (:ratingMax IS NULL OR gp.rating <= :ratingMax)
            GROUP BY r.minuteIndex, r.resourceCode
            ORDER BY r.minuteIndex, r.resourceCode
            """)
    List<ResourceTimelineRow> aggregateResourceTimeline(@Param("profileId") long profileId,
                                                        @Param("civCode") String civCode,
                                                        @Param("leaderboard") String leaderboard,
                                                        @Param("patchNumber") Integer patchNumber,
                                                        @Param("dateFrom") Instant dateFrom,
                                                        @Param("dateTo") Instant dateTo,
                                                        @Param("ratingMin") Integer ratingMin,
                                                        @Param("ratingMax") Integer ratingMax);

    @Query("""
            SELECT e.entityType AS entityType,
                   e.pbgid AS pbgid,
                   COUNT(e) AS eventCount
            FROM FactBuildEvent e
            JOIN FactGame g ON g.gameId = e.gameId
            LEFT JOIN FactGamePlayer gp ON gp.gameId = e.gameId AND gp.profileId = e.profileId
            JOIN RawGameSummary rs ON rs.gameId = e.gameId AND rs.fetchStatus = 'SUCCESS'
            WHERE e.profileId = :profileId
              AND e.eventKind = 'FINISHED'
              AND e.eventSecond >= :minuteFrom * 60
              AND e.eventSecond < :minuteTo * 60
              AND (:civCode IS NULL OR gp.civCode = :civCode)
              AND (:leaderboard IS NULL OR g.leaderboardCode = :leaderboard)
              AND (:dateFrom IS NULL OR g.startedAt >= :dateFrom)
              AND (:dateTo IS NULL OR g.startedAt <= :dateTo)
              AND (:ratingMin IS NULL OR gp.rating >= :ratingMin)
              AND (:ratingMax IS NULL OR gp.rating <= :ratingMax)
            GROUP BY e.entityType, e.pbgid
            ORDER BY COUNT(e) DESC
            """)
    List<BuildPreferenceRow> aggregateBuildPreferences(@Param("profileId") long profileId,
                                                       @Param("civCode") String civCode,
                                                       @Param("leaderboard") String leaderboard,
                                                       @Param("minuteFrom") int minuteFrom,
                                                       @Param("minuteTo") int minuteTo,
                                                       @Param("dateFrom") Instant dateFrom,
                                                       @Param("dateTo") Instant dateTo,
                                                       @Param("ratingMin") Integer ratingMin,
                                                       @Param("ratingMax") Integer ratingMax);

    @Query("""
            SELECT CAST(COALESCE(m.mapId, 0) AS string) AS mapCode,
                   COALESCE(m.mapName, 'Unknown') AS mapName,
                   COUNT(gp) AS games,
                   SUM(CASE WHEN gp.won = TRUE THEN 1 ELSE 0 END) AS wins,
                   SUM(CASE WHEN gp.won = FALSE OR gp.won IS NULL THEN 1 ELSE 0 END) AS losses
            FROM FactGamePlayer gp
            JOIN FactGame g ON g.gameId = gp.gameId
            LEFT JOIN DimMap m ON m.mapId = g.mapId
            WHERE gp.profileId = :profileId
              AND (:civCode IS NULL OR gp.civCode = :civCode)
              AND (:leaderboard IS NULL OR g.leaderboardCode = :leaderboard)
              AND (:patchNumber IS NULL OR g.patchNumber = :patchNumber)
              AND (:dateFrom IS NULL OR g.startedAt >= :dateFrom)
              AND (:dateTo IS NULL OR g.startedAt <= :dateTo)
              AND (:ratingMin IS NULL OR gp.rating >= :ratingMin)
              AND (:ratingMax IS NULL OR gp.rating <= :ratingMax)
            GROUP BY m.mapId, m.mapName
            ORDER BY COUNT(gp) DESC
            """)
    List<MapAggregateRow> aggregateMapStats(@Param("profileId") long profileId,
                                            @Param("civCode") String civCode,
                                            @Param("leaderboard") String leaderboard,
                                            @Param("patchNumber") Integer patchNumber,
                                            @Param("dateFrom") Instant dateFrom,
                                            @Param("dateTo") Instant dateTo,
                                            @Param("ratingMin") Integer ratingMin,
                                            @Param("ratingMax") Integer ratingMax);

    @Query("""
            SELECT CAST(COALESCE(g.patchNumber, 0) AS string) AS patchCode,
                   CONCAT('Patch ', CAST(COALESCE(g.patchNumber, 0) AS string)) AS patchLabel,
                   COUNT(gp) AS games,
                   SUM(CASE WHEN gp.won = TRUE THEN 1 ELSE 0 END) AS wins,
                   SUM(CASE WHEN gp.won = FALSE OR gp.won IS NULL THEN 1 ELSE 0 END) AS losses
            FROM FactGamePlayer gp
            JOIN FactGame g ON g.gameId = gp.gameId
            WHERE gp.profileId = :profileId
              AND (:civCode IS NULL OR gp.civCode = :civCode)
              AND (:leaderboard IS NULL OR g.leaderboardCode = :leaderboard)
              AND (:dateFrom IS NULL OR g.startedAt >= :dateFrom)
              AND (:dateTo IS NULL OR g.startedAt <= :dateTo)
              AND (:ratingMin IS NULL OR gp.rating >= :ratingMin)
              AND (:ratingMax IS NULL OR gp.rating <= :ratingMax)
            GROUP BY g.patchNumber
            ORDER BY g.patchNumber DESC
            """)
    List<PatchAggregateRow> aggregatePatchStats(@Param("profileId") long profileId,
                                              @Param("civCode") String civCode,
                                              @Param("leaderboard") String leaderboard,
                                              @Param("dateFrom") Instant dateFrom,
                                              @Param("dateTo") Instant dateTo,
                                              @Param("ratingMin") Integer ratingMin,
                                              @Param("ratingMax") Integer ratingMax);

    @Query("""
            SELECT COALESCE(g.leaderboardCode, 'unknown') AS modeCode,
                   COALESCE(l.displayName, g.leaderboardCode, 'Unknown') AS modeName,
                   COUNT(gp) AS games,
                   SUM(CASE WHEN gp.won = TRUE THEN 1 ELSE 0 END) AS wins,
                   SUM(CASE WHEN gp.won = FALSE OR gp.won IS NULL THEN 1 ELSE 0 END) AS losses
            FROM FactGamePlayer gp
            JOIN FactGame g ON g.gameId = gp.gameId
            LEFT JOIN DimLeaderboard l ON l.leaderboardCode = g.leaderboardCode
            WHERE gp.profileId = :profileId
              AND (:civCode IS NULL OR gp.civCode = :civCode)
              AND (:patchNumber IS NULL OR g.patchNumber = :patchNumber)
              AND (:dateFrom IS NULL OR g.startedAt >= :dateFrom)
              AND (:dateTo IS NULL OR g.startedAt <= :dateTo)
              AND (:ratingMin IS NULL OR gp.rating >= :ratingMin)
              AND (:ratingMax IS NULL OR gp.rating <= :ratingMax)
            GROUP BY g.leaderboardCode, l.displayName
            ORDER BY COUNT(gp) DESC
            """)
    List<ModeAggregateRow> aggregateModeStats(@Param("profileId") long profileId,
                                              @Param("civCode") String civCode,
                                              @Param("patchNumber") Integer patchNumber,
                                              @Param("dateFrom") Instant dateFrom,
                                              @Param("dateTo") Instant dateTo,
                                              @Param("ratingMin") Integer ratingMin,
                                              @Param("ratingMax") Integer ratingMax);

    @Query("""
            SELECT gp.civCode AS civCode,
                   COUNT(c) AS games,
                   AVG(c.buildingsLost) AS avgBuildingsLost,
                   AVG(c.unitsLost) AS avgUnitsLost,
                   AVG(c.unitKills) AS avgUnitKills,
                   AVG(c.squadKills) AS avgSquadKills,
                   AVG(c.enemyDeaths) AS avgEnemyDeaths
            FROM FactPlayerCombatStats c
            JOIN FactGamePlayer gp ON gp.gameId = c.gameId AND gp.profileId = c.profileId
            JOIN FactGame g ON g.gameId = c.gameId
            JOIN RawGameSummary rs ON rs.gameId = c.gameId AND rs.fetchStatus = 'SUCCESS'
            WHERE c.profileId = :profileId
              AND (:civCode IS NULL OR gp.civCode = :civCode)
              AND (:leaderboard IS NULL OR g.leaderboardCode = :leaderboard)
              AND (:patchNumber IS NULL OR g.patchNumber = :patchNumber)
              AND (:dateFrom IS NULL OR g.startedAt >= :dateFrom)
              AND (:dateTo IS NULL OR g.startedAt <= :dateTo)
              AND (:ratingMin IS NULL OR gp.rating >= :ratingMin)
              AND (:ratingMax IS NULL OR gp.rating <= :ratingMax)
            GROUP BY gp.civCode
            ORDER BY COUNT(c) DESC
            """)
    List<CombatAggregateRow> aggregateCombatStats(@Param("profileId") long profileId,
                                                  @Param("civCode") String civCode,
                                                  @Param("leaderboard") String leaderboard,
                                                  @Param("patchNumber") Integer patchNumber,
                                                  @Param("dateFrom") Instant dateFrom,
                                                  @Param("dateTo") Instant dateTo,
                                                  @Param("ratingMin") Integer ratingMin,
                                                  @Param("ratingMax") Integer ratingMax);

    @Query("""
            SELECT e.entityType AS entityType,
                   e.pbgid AS pbgid,
                   COUNT(e) AS lossCount,
                   COUNT(DISTINCT e.gameId) AS gameCount
            FROM FactBuildEvent e
            JOIN FactGame g ON g.gameId = e.gameId
            LEFT JOIN FactGamePlayer gp ON gp.gameId = e.gameId AND gp.profileId = e.profileId
            JOIN RawGameSummary rs ON rs.gameId = e.gameId AND rs.fetchStatus = 'SUCCESS'
            WHERE e.profileId = :profileId
              AND e.eventKind = 'DESTROYED'
              AND (:civCode IS NULL OR gp.civCode = :civCode)
              AND (:leaderboard IS NULL OR g.leaderboardCode = :leaderboard)
              AND (:patchNumber IS NULL OR g.patchNumber = :patchNumber)
              AND (:dateFrom IS NULL OR g.startedAt >= :dateFrom)
              AND (:dateTo IS NULL OR g.startedAt <= :dateTo)
              AND (:ratingMin IS NULL OR gp.rating >= :ratingMin)
              AND (:ratingMax IS NULL OR gp.rating <= :ratingMax)
            GROUP BY e.entityType, e.pbgid
            ORDER BY COUNT(e) DESC
            """)
    List<UnitLossAggregateRow> aggregateUnitLosses(@Param("profileId") long profileId,
                                                   @Param("civCode") String civCode,
                                                   @Param("leaderboard") String leaderboard,
                                                   @Param("patchNumber") Integer patchNumber,
                                                   @Param("dateFrom") Instant dateFrom,
                                                   @Param("dateTo") Instant dateTo,
                                                   @Param("ratingMin") Integer ratingMin,
                                                   @Param("ratingMax") Integer ratingMax);

    interface CivAggregateRow {
        String getCivCode();

        long getGames();

        long getWins();

        long getLosses();
    }

    interface MapAggregateRow {
        String getMapCode();

        String getMapName();

        long getGames();

        long getWins();

        long getLosses();
    }

    interface ModeAggregateRow {
        String getModeCode();

        String getModeName();

        long getGames();

        long getWins();

        long getLosses();
    }

    interface CombatAggregateRow {
        String getCivCode();

        long getGames();

        Double getAvgBuildingsLost();

        Double getAvgUnitsLost();

        Double getAvgUnitKills();

        Double getAvgSquadKills();

        Double getAvgEnemyDeaths();
    }

    interface UnitLossAggregateRow {
        String getEntityType();

        Long getPbgid();

        long getLossCount();

        long getGameCount();
    }

    interface PatchAggregateRow {
        String getPatchCode();

        String getPatchLabel();

        long getGames();

        long getWins();

        long getLosses();
    }

    interface MatchupAggregateRow {
        String getPlayerCiv();

        String getOpponentCiv();

        long getGames();

        long getWins();

        long getLosses();

        Double getAvgMilitaryDiff();
    }

    interface ResourceTimelineRow {
        int getMinute();

        String getResource();

        Double getAvgValue();

        long getGameCount();
    }

    interface BuildPreferenceRow {
        String getEntityType();

        Long getPbgid();

        long getEventCount();
    }
}
