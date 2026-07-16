package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.AggMatchupMatrix;
import com.aoe4.persistence.entity.AggPlayerCivStats;
import com.aoe4.persistence.entity.AggResourceTimeline;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AggAnalyticsRepository extends JpaRepository<AggPlayerCivStats, AggPlayerCivStats.Id> {

    String ALL_DIMENSION = "*";

    @Query("""
            SELECT a.id.civCode AS civCode,
                   a.games AS games,
                   a.wins AS wins,
                   a.losses AS losses
            FROM AggPlayerCivStats a
            WHERE a.id.profileId = :profileId
              AND a.id.leaderboardCode = :leaderboardCode
            ORDER BY a.games DESC
            """)
    List<AnalyticsRepository.CivAggregateRow> findCivStats(@Param("profileId") long profileId,
                                                         @Param("leaderboardCode") String leaderboardCode);

    @Query("""
            SELECT a.id.playerCiv AS playerCiv,
                   a.id.opponentCiv AS opponentCiv,
                   a.games AS games,
                   a.wins AS wins,
                   a.losses AS losses,
                   CASE WHEN a.games = 0 THEN NULL ELSE a.militaryDiffSum / a.games END AS avgMilitaryDiff
            FROM AggMatchupMatrix a
            WHERE a.id.profileId = :profileId
              AND a.id.leaderboardCode = :leaderboardCode
              AND (:playerCiv IS NULL OR a.id.playerCiv = :playerCiv)
              AND (:opponentCiv IS NULL OR a.id.opponentCiv = :opponentCiv)
            ORDER BY a.games DESC
            """)
    List<AnalyticsRepository.MatchupAggregateRow> findMatchups(@Param("profileId") long profileId,
                                                               @Param("leaderboardCode") String leaderboardCode,
                                                               @Param("playerCiv") String playerCiv,
                                                               @Param("opponentCiv") String opponentCiv);

    @Query("""
            SELECT a.id.minuteIndex AS minute,
                   a.id.resourceCode AS resource,
                   a.avgValue AS avgValue,
                   a.gameCount AS gameCount
            FROM AggResourceTimeline a
            WHERE a.id.profileId = :profileId
              AND a.id.leaderboardCode = :leaderboardCode
              AND a.id.civCode = :civCode
            ORDER BY a.id.minuteIndex, a.id.resourceCode
            """)
    List<AnalyticsRepository.ResourceTimelineRow> findResourceTimeline(@Param("profileId") long profileId,
                                                                       @Param("leaderboardCode") String leaderboardCode,
                                                                       @Param("civCode") String civCode);

    @Query("SELECT COUNT(a) FROM AggPlayerCivStats a WHERE a.id.profileId = :profileId")
    long countByProfileId(@Param("profileId") long profileId);
}
