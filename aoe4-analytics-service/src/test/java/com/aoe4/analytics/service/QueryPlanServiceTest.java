package com.aoe4.analytics.service;

import com.aoe4.common.dto.ApiViews.QueryPlanReportView;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class QueryPlanServiceTest {

    @Mock
    private JdbcTemplate jdbcTemplate;
    @Mock
    private DataSource dataSource;
    @Mock
    private QueryPlanService.DimPlayerLookup dimPlayerLookup;
    @Mock
    private Connection connection;
    @Mock
    private DatabaseMetaData databaseMetaData;

    private QueryPlanService queryPlanService;

    @BeforeEach
    void setUp() throws SQLException {
        queryPlanService = new QueryPlanService(jdbcTemplate, dataSource, dimPlayerLookup);
        lenient().when(dataSource.getConnection()).thenReturn(connection);
        lenient().when(connection.getMetaData()).thenReturn(databaseMetaData);
        lenient().when(databaseMetaData.getDatabaseProductName()).thenReturn("H2");
    }

    @Test
    void explainPlansReturnsAllQuerySpecs() throws SQLException {
        long profileId = 1224481L;
        when(jdbcTemplate.queryForObject(anyString(), eq(Long.class), eq(profileId))).thenReturn(1L);
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq(profileId)))
                .thenAnswer(invocation -> List.of("INDEX SCAN ON fact_game_player"));

        QueryPlanReportView report = queryPlanService.explainPlans(profileId);

        verify(dimPlayerLookup).requireExists(profileId);
        assertThat(report.profileId()).isEqualTo(profileId);
        assertThat(report.databaseProduct()).isEqualTo("H2");
        assertThat(report.plans()).hasSize(7);
        assertThat(report.plans().get(0).queryKey()).isEqualTo("civ-stats");
        assertThat(report.plans().get(0).planLines()).contains("INDEX SCAN ON fact_game_player");
    }

    @Test
    void formatExplainRowJoinsColumns() throws SQLException {
        ResultSet rs = org.mockito.Mockito.mock(ResultSet.class);
        ResultSetMetaData meta = org.mockito.Mockito.mock(ResultSetMetaData.class);
        when(rs.getMetaData()).thenReturn(meta);
        when(meta.getColumnCount()).thenReturn(2);
        when(rs.getString(1)).thenReturn("PLAN");
        when(rs.getString(2)).thenReturn("INDEX SCAN");

        when(jdbcTemplate.queryForObject(anyString(), eq(Long.class), eq(1L))).thenReturn(0L);
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq(1L)))
                .thenAnswer(invocation -> {
                    RowMapper<?> mapper = invocation.getArgument(1);
                    return List.of(mapper.mapRow(rs, 0));
                });

        QueryPlanReportView report = queryPlanService.explainPlans(1L);

        assertThat(report.plans().get(0).planLines().get(0)).isEqualTo("PLAN INDEX SCAN");
    }
}
