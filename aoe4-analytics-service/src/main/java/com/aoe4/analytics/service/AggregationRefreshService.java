package com.aoe4.analytics.service;

import com.aoe4.analytics.cache.AnalyticsResponseCache;
import com.aoe4.common.metrics.Aoe4Metrics;
import com.aoe4.common.config.Aoe4Properties;
import com.aoe4.persistence.repository.FactGamePlayerRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class AggregationRefreshService {

    private static final Logger log = LoggerFactory.getLogger(AggregationRefreshService.class);

    private final JdbcTemplate jdbcTemplate;
    private final FactGamePlayerRepository factGamePlayerRepository;
    private final Aoe4Properties properties;
    private final AnalyticsResponseCache analyticsResponseCache;
    private final Aoe4Metrics metrics;

    public AggregationRefreshService(JdbcTemplate jdbcTemplate,
                                     FactGamePlayerRepository factGamePlayerRepository,
                                     Aoe4Properties properties,
                                     AnalyticsResponseCache analyticsResponseCache,
                                     Aoe4Metrics metrics) {
        this.jdbcTemplate = jdbcTemplate;
        this.factGamePlayerRepository = factGamePlayerRepository;
        this.properties = properties;
        this.analyticsResponseCache = analyticsResponseCache;
        this.metrics = metrics;
    }

    @Transactional
    public void refreshProfile(long profileId) {
        if (!properties.getAggregation().isEnabled()) {
            return;
        }

        var sample = metrics.startAggregationRefresh();
        try {
            jdbcTemplate.update("DELETE FROM agg_player_civ_stats WHERE profile_id = ?", profileId);
            jdbcTemplate.update("DELETE FROM agg_matchup_matrix WHERE profile_id = ?", profileId);
            jdbcTemplate.update("DELETE FROM agg_resource_timeline WHERE profile_id = ?", profileId);

            refreshCivStats(profileId);
            refreshMatchups(profileId);
            refreshResourceTimeline(profileId);

            analyticsResponseCache.invalidateProfile(profileId);
            metrics.recordAggregationRefresh();
            log.info("Refreshed aggregation tables for profile {}", profileId);
        } finally {
            metrics.stopAggregationRefresh(sample);
        }
    }

    public void refreshAllProfiles() {
        if (!properties.getAggregation().isEnabled()) {
            return;
        }
        List<Long> profileIds = factGamePlayerRepository.findDistinctProfileIds();
        for (Long profileId : profileIds) {
            refreshProfile(profileId);
        }
        log.info("Refreshed aggregation tables for {} profiles", profileIds.size());
    }

    private void refreshCivStats(long profileId) {
        jdbcTemplate.update("""
                INSERT INTO agg_player_civ_stats (profile_id, leaderboard_code, civ_code, games, wins, losses, refreshed_at)
                SELECT gp.profile_id,
                       g.leaderboard_code,
                       gp.civ_code,
                       COUNT(*),
                       SUM(CASE WHEN gp.won = TRUE THEN 1 ELSE 0 END),
                       SUM(CASE WHEN gp.won = FALSE OR gp.won IS NULL THEN 1 ELSE 0 END),
                       CURRENT_TIMESTAMP
                FROM fact_game_player gp
                JOIN fact_game g ON g.game_id = gp.game_id
                WHERE gp.profile_id = ?
                  AND gp.civ_code IS NOT NULL
                GROUP BY gp.profile_id, g.leaderboard_code, gp.civ_code
                """, profileId);

        jdbcTemplate.update("""
                INSERT INTO agg_player_civ_stats (profile_id, leaderboard_code, civ_code, games, wins, losses, refreshed_at)
                SELECT gp.profile_id,
                       '*',
                       gp.civ_code,
                       COUNT(*),
                       SUM(CASE WHEN gp.won = TRUE THEN 1 ELSE 0 END),
                       SUM(CASE WHEN gp.won = FALSE OR gp.won IS NULL THEN 1 ELSE 0 END),
                       CURRENT_TIMESTAMP
                FROM fact_game_player gp
                WHERE gp.profile_id = ?
                  AND gp.civ_code IS NOT NULL
                GROUP BY gp.profile_id, gp.civ_code
                """, profileId);
    }

    private void refreshMatchups(long profileId) {
        jdbcTemplate.update("""
                INSERT INTO agg_matchup_matrix (
                    profile_id, leaderboard_code, player_civ, opponent_civ,
                    games, wins, losses, military_diff_sum, refreshed_at
                )
                SELECT gp.profile_id,
                       g.leaderboard_code,
                       gp.civ_code,
                       opp.civ_code,
                       COUNT(*),
                       SUM(CASE WHEN gp.won = TRUE THEN 1 ELSE 0 END),
                       SUM(CASE WHEN gp.won = FALSE OR gp.won IS NULL THEN 1 ELSE 0 END),
                       SUM(CAST(s.military_score AS DOUBLE) - CAST(os.military_score AS DOUBLE)),
                       CURRENT_TIMESTAMP
                FROM fact_game_player gp
                JOIN fact_game g ON g.game_id = gp.game_id
                JOIN fact_game_player opp ON opp.game_id = gp.game_id AND opp.profile_id <> gp.profile_id
                LEFT JOIN fact_game_player_score s ON s.game_id = gp.game_id AND s.profile_id = gp.profile_id
                LEFT JOIN fact_game_player_score os ON os.game_id = opp.game_id AND os.profile_id = opp.profile_id
                WHERE gp.profile_id = ?
                  AND gp.civ_code IS NOT NULL
                  AND opp.civ_code IS NOT NULL
                GROUP BY gp.profile_id, g.leaderboard_code, gp.civ_code, opp.civ_code
                """, profileId);

        jdbcTemplate.update("""
                INSERT INTO agg_matchup_matrix (
                    profile_id, leaderboard_code, player_civ, opponent_civ,
                    games, wins, losses, military_diff_sum, refreshed_at
                )
                SELECT gp.profile_id,
                       '*',
                       gp.civ_code,
                       opp.civ_code,
                       COUNT(*),
                       SUM(CASE WHEN gp.won = TRUE THEN 1 ELSE 0 END),
                       SUM(CASE WHEN gp.won = FALSE OR gp.won IS NULL THEN 1 ELSE 0 END),
                       SUM(CAST(s.military_score AS DOUBLE) - CAST(os.military_score AS DOUBLE)),
                       CURRENT_TIMESTAMP
                FROM fact_game_player gp
                JOIN fact_game_player opp ON opp.game_id = gp.game_id AND opp.profile_id <> gp.profile_id
                LEFT JOIN fact_game_player_score s ON s.game_id = gp.game_id AND s.profile_id = gp.profile_id
                LEFT JOIN fact_game_player_score os ON os.game_id = opp.game_id AND os.profile_id = opp.profile_id
                WHERE gp.profile_id = ?
                  AND gp.civ_code IS NOT NULL
                  AND opp.civ_code IS NOT NULL
                GROUP BY gp.profile_id, gp.civ_code, opp.civ_code
                """, profileId);
    }

    private void refreshResourceTimeline(long profileId) {
        insertResourceTimelineRows(profileId, "g.leaderboard_code", "gp.civ_code", "g.leaderboard_code, gp.civ_code");
        insertResourceTimelineRows(profileId, "g.leaderboard_code", "'*'", "g.leaderboard_code");
        insertResourceTimelineRows(profileId, "'*'", "gp.civ_code", "gp.civ_code");
        insertResourceTimelineRows(profileId, "'*'", "'*'", null);
    }

    private void insertResourceTimelineRows(long profileId,
                                            String leaderboardExpr,
                                            String civExpr,
                                            String groupByClause) {
        String groupBy = groupByClause == null ? "" : "GROUP BY r.profile_id, " + groupByClause + ", r.minute_index, r.resource_code";
        String sql = """
                INSERT INTO agg_resource_timeline (
                    profile_id, leaderboard_code, civ_code, minute_index, resource_code,
                    avg_value, game_count, refreshed_at
                )
                SELECT r.profile_id,
                       %s,
                       %s,
                       r.minute_index,
                       r.resource_code,
                       AVG(r.accumulated_value),
                       COUNT(DISTINCT r.game_id),
                       CURRENT_TIMESTAMP
                FROM fact_game_player_resource r
                JOIN fact_game g ON g.game_id = r.game_id
                LEFT JOIN fact_game_player gp ON gp.game_id = r.game_id AND gp.profile_id = r.profile_id
                JOIN raw_game_summary rs ON rs.game_id = r.game_id AND rs.fetch_status = 'SUCCESS'
                WHERE r.profile_id = ?
                %s
                """.formatted(leaderboardExpr, civExpr, groupBy);
        jdbcTemplate.update(sql, profileId);
    }
}
