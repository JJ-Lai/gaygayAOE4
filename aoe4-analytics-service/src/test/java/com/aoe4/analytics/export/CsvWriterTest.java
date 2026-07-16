package com.aoe4.analytics.export;

import com.aoe4.common.dto.AnalyticsViews.MapStatRow;
import com.aoe4.common.dto.AnalyticsViews.MapStatsView;
import com.aoe4.common.dto.AnalyticsViews.PatchStatRow;
import com.aoe4.common.dto.AnalyticsViews.PatchStatsView;
import com.aoe4.common.dto.AnalyticsViews.MatchupMatrixView;
import com.aoe4.common.dto.AnalyticsViews.MatchupRow;
import com.aoe4.common.dto.AnalyticsViews.CombatStatRow;
import com.aoe4.common.dto.AnalyticsViews.CombatStatsView;
import com.aoe4.common.dto.AnalyticsViews.UnitLossRow;
import com.aoe4.common.dto.AnalyticsViews.UnitLossStatsView;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CsvWriterTest {

    @Test
    void writesMatchupHeaderAndRows() {
        var view = new MatchupMatrixView(10861747L, java.util.List.of(
                new MatchupRow("english", "french", 3, 2, 0.6, 120.5)
        ));

        String csv = CsvWriter.matchupMatrix(view);

        assertThat(csv).contains("player_civ,opponent_civ,wins,losses,win_rate,avg_military_diff");
        assertThat(csv).contains("english,french,3,2,0.6000,120.50");
    }

    @Test
    void writesMapStatsHeaderAndRows() {
        var view = new MapStatsView(10861747L, java.util.List.of(
                new MapStatRow("12", "Dry Arabia", 10, 6, 4, 0.6)
        ));

        String csv = CsvWriter.mapStats(view);

        assertThat(csv).contains("map_code,map_name,games,wins,losses,win_rate");
        assertThat(csv).contains("12,Dry Arabia,10,6,4,0.6000");
    }

    @Test
    void writesPatchStatsHeaderAndRows() {
        var view = new PatchStatsView(10861747L, java.util.List.of(
                new PatchStatRow("12", "Patch 12", 8, 5, 3, 0.625)
        ));

        String csv = CsvWriter.patchStats(view);

        assertThat(csv).contains("patch_code,patch_label,games,wins,losses,win_rate");
        assertThat(csv).contains("12,Patch 12,8,5,3,0.6250");
    }

    @Test
    void writesCombatStatsHeaderAndRows() {
        var view = new CombatStatsView(1224481L, java.util.List.of(
                new CombatStatRow("rus", "Rus", 5, 10.5, 20.0, 15.0, 12.0, 8.0)
        ));

        String csv = CsvWriter.combatStats(view);

        assertThat(csv).contains("civ_code,civ_name,games,avg_buildings_lost");
        assertThat(csv).contains("rus,Rus,5,10.50,20.00");
    }

    @Test
    void writesUnitLossStatsHeaderAndRows() {
        var view = new UnitLossStatsView(1224481L, java.util.List.of(
                new UnitLossRow("Unit", 1234L, "Knight", 42, 10)
        ));

        String csv = CsvWriter.unitLossStats(view);

        assertThat(csv).contains("entity_type,pbgid,display_name,loss_count,game_count");
        assertThat(csv).contains("Unit,1234,Knight,42,10");
    }
}
