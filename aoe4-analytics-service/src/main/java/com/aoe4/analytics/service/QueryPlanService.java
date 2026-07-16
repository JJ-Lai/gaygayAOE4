package com.aoe4.analytics.service;

import com.aoe4.common.dto.ApiViews.QueryPlanEntryView;
import com.aoe4.common.dto.ApiViews.QueryPlanReportView;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class QueryPlanService {

    private static final List<QuerySpec> SPECS = List.of(
            new QuerySpec(
                    "civ-stats",
                    "各文明勝率聚合",
                    """
                            SELECT gp.civ_code, COUNT(*) AS games
                            FROM fact_game_player gp
                            JOIN fact_game g ON g.game_id = gp.game_id
                            WHERE gp.profile_id = ?
                            GROUP BY gp.civ_code
                            """
            ),
            new QuerySpec(
                    "matchup-matrix",
                    "文明對戰矩陣",
                    """
                            SELECT gp.civ_code, opp.civ_code, COUNT(*) AS games
                            FROM fact_game_player gp
                            JOIN fact_game g ON g.game_id = gp.game_id
                            JOIN fact_game_player opp ON opp.game_id = gp.game_id AND opp.profile_id <> gp.profile_id
                            WHERE gp.profile_id = ?
                              AND opp.civ_code IS NOT NULL
                            GROUP BY gp.civ_code, opp.civ_code
                            """
            ),
            new QuerySpec(
                    "resource-timeline",
                    "資源時間序列",
                    """
                            SELECT r.minute_index, r.resource_code, AVG(r.accumulated_value) AS avg_value
                            FROM fact_game_player_resource r
                            JOIN fact_game g ON g.game_id = r.game_id
                            JOIN raw_game_summary rs ON rs.game_id = r.game_id AND rs.fetch_status = 'SUCCESS'
                            WHERE r.profile_id = ?
                            GROUP BY r.minute_index, r.resource_code
                            """
            ),
            new QuerySpec(
                    "build-preferences",
                    "建造偏好（FINISHED 事件）",
                    """
                            SELECT e.entity_type, e.pbgid, COUNT(*) AS event_count
                            FROM fact_build_event e
                            JOIN fact_game g ON g.game_id = e.game_id
                            JOIN raw_game_summary rs ON rs.game_id = e.game_id AND rs.fetch_status = 'SUCCESS'
                            WHERE e.profile_id = ?
                              AND e.event_kind = 'FINISHED'
                            GROUP BY e.entity_type, e.pbgid
                            """
            ),
            new QuerySpec(
                    "unit-loss-stats",
                    "單位/建築損失（DESTROYED 事件）",
                    """
                            SELECT e.entity_type, e.pbgid, COUNT(*) AS loss_count
                            FROM fact_build_event e
                            JOIN fact_game g ON g.game_id = e.game_id
                            JOIN raw_game_summary rs ON rs.game_id = e.game_id AND rs.fetch_status = 'SUCCESS'
                            WHERE e.profile_id = ?
                              AND e.event_kind = 'DESTROYED'
                            GROUP BY e.entity_type, e.pbgid
                            """
            ),
            new QuerySpec(
                    "combat-stats",
                    "戰鬥統計（fact_player_combat_stats）",
                    """
                            SELECT gp.civ_code, COUNT(*) AS games, AVG(cs.units_lost) AS avg_units_lost
                            FROM fact_player_combat_stats cs
                            JOIN fact_game_player gp ON gp.game_id = cs.game_id AND gp.profile_id = cs.profile_id
                            JOIN raw_game_summary rs ON rs.game_id = cs.game_id AND rs.fetch_status = 'SUCCESS'
                            WHERE cs.profile_id = ?
                            GROUP BY gp.civ_code
                            """
            ),
            new QuerySpec(
                    "agg-matchup-matrix",
                    "預聚合 Matchup 矩陣",
                    """
                            SELECT player_civ, opponent_civ, games, wins, losses
                            FROM agg_matchup_matrix
                            WHERE profile_id = ?
                            """
            )
    );

    private final JdbcTemplate jdbcTemplate;
    private final DataSource dataSource;
    private final DimPlayerLookup dimPlayerLookup;

    public QueryPlanService(JdbcTemplate jdbcTemplate,
                            DataSource dataSource,
                            DimPlayerLookup dimPlayerLookup) {
        this.jdbcTemplate = jdbcTemplate;
        this.dataSource = dataSource;
        this.dimPlayerLookup = dimPlayerLookup;
    }

    public QueryPlanReportView explainPlans(long profileId) {
        dimPlayerLookup.requireExists(profileId);
        String databaseProduct = detectDatabaseProduct();
        List<QueryPlanEntryView> plans = new ArrayList<>(SPECS.size());
        for (QuerySpec spec : SPECS) {
            long executionMs = -1;
            List<String> planLines;
            try {
                executionMs = measureExecutionMs(spec.sql(), profileId);
                planLines = fetchExplainPlan(spec.sql(), profileId, databaseProduct);
            } catch (Exception ex) {
                planLines = List.of("ERROR: " + ex.getMessage());
            }
            plans.add(new QueryPlanEntryView(spec.key(), spec.description(), executionMs, planLines));
        }
        return new QueryPlanReportView(profileId, databaseProduct, plans, Instant.now());
    }

    private long measureExecutionMs(String sql, long profileId) {
        long start = System.nanoTime();
        jdbcTemplate.queryForObject("SELECT COUNT(*) FROM (" + sql + ") aggregated", Long.class, profileId);
        return (System.nanoTime() - start) / 1_000_000L;
    }

    private List<String> fetchExplainPlan(String sql, long profileId, String databaseProduct) {
        String explainSql = "EXPLAIN " + sql;
        return jdbcTemplate.query(explainSql, (rs, rowNum) -> formatExplainRow(rs), profileId);
    }

    private static String formatExplainRow(java.sql.ResultSet rs) throws SQLException {
        int columnCount = rs.getMetaData().getColumnCount();
        StringBuilder line = new StringBuilder();
        for (int i = 1; i <= columnCount; i++) {
            if (i > 1) {
                line.append(' ');
            }
            String value = rs.getString(i);
            if (value != null) {
                line.append(value);
            }
        }
        return line.toString();
    }

    private String detectDatabaseProduct() {
        try (Connection connection = dataSource.getConnection()) {
            String product = connection.getMetaData().getDatabaseProductName();
            return product != null ? product : "unknown";
        } catch (SQLException ex) {
            return "unknown";
        }
    }

    private record QuerySpec(String key, String description, String sql) {
    }

    public interface DimPlayerLookup {
        void requireExists(long profileId);
    }

    @Service
    static class DimPlayerRepositoryAdapter implements DimPlayerLookup {
        private final com.aoe4.persistence.repository.DimPlayerRepository dimPlayerRepository;

        DimPlayerRepositoryAdapter(com.aoe4.persistence.repository.DimPlayerRepository dimPlayerRepository) {
            this.dimPlayerRepository = dimPlayerRepository;
        }

        @Override
        public void requireExists(long profileId) {
            if (!dimPlayerRepository.existsById(profileId)) {
                throw new PlayerNotFoundException(profileId);
            }
        }
    }
}
