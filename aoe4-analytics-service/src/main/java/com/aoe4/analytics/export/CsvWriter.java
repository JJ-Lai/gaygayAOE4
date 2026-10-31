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
import com.aoe4.common.dto.ApiViews.GamePageView;
import com.aoe4.common.dto.ApiViews.GameView;

import java.util.List;
import java.util.Locale;

public final class CsvWriter {

    private CsvWriter() {
    }

    public static String matchupMatrix(MatchupMatrixView view) {
        StringBuilder sb = new StringBuilder();
        appendRow(sb, "player_civ", "opponent_civ", "wins", "losses", "win_rate", "avg_military_diff");
        for (MatchupRow row : view.matchups()) {
            appendRow(sb,
                    row.playerCiv(),
                    row.opponentCiv(),
                    String.valueOf(row.wins()),
                    String.valueOf(row.losses()),
                    formatPercent(row.winRate()),
                    row.avgMilitaryDiff() != null ? String.format(Locale.ROOT, "%.2f", row.avgMilitaryDiff()) : ""
            );
        }
        return sb.toString();
    }

    public static String mapStats(MapStatsView view) {
        StringBuilder sb = new StringBuilder();
        appendRow(sb, "map_code", "map_name", "games", "wins", "losses", "win_rate");
        for (MapStatRow row : view.maps()) {
            appendRow(sb,
                    row.mapCode(),
                    row.mapName(),
                    String.valueOf(row.games()),
                    String.valueOf(row.wins()),
                    String.valueOf(row.losses()),
                    formatPercent(row.winRate())
            );
        }
        return sb.toString();
    }

    public static String patchStats(PatchStatsView view) {
        StringBuilder sb = new StringBuilder();
        appendRow(sb, "patch_code", "patch_label", "games", "wins", "losses", "win_rate");
        for (PatchStatRow row : view.patches()) {
            appendRow(sb,
                    row.patchCode(),
                    row.patchLabel(),
                    String.valueOf(row.games()),
                    String.valueOf(row.wins()),
                    String.valueOf(row.losses()),
                    formatPercent(row.winRate())
            );
        }
        return sb.toString();
    }

    public static String combatStats(CombatStatsView view) {
        StringBuilder sb = new StringBuilder();
        appendRow(sb, "civ_code", "civ_name", "games", "avg_buildings_lost", "avg_units_lost",
                "avg_unit_kills", "avg_squad_kills", "avg_enemy_deaths");
        for (CombatStatRow row : view.civilizations()) {
            appendRow(sb,
                    row.civCode(),
                    row.civName(),
                    String.valueOf(row.games()),
                    formatDouble(row.avgBuildingsLost()),
                    formatDouble(row.avgUnitsLost()),
                    formatDouble(row.avgUnitKills()),
                    formatDouble(row.avgSquadKills()),
                    formatDouble(row.avgEnemyDeaths())
            );
        }
        return sb.toString();
    }

    public static String unitLossStats(UnitLossStatsView view) {
        StringBuilder sb = new StringBuilder();
        appendRow(sb, "entity_type", "pbgid", "display_name", "loss_count", "game_count");
        for (UnitLossRow row : view.units()) {
            appendRow(sb,
                    row.entityType(),
                    row.pbgid() != null ? String.valueOf(row.pbgid()) : "",
                    row.displayName(),
                    String.valueOf(row.lossCount()),
                    String.valueOf(row.gameCount())
            );
        }
        return sb.toString();
    }

    public static String games(long profileId, GamePageView page) {
        StringBuilder sb = new StringBuilder();
        appendRow(sb, "game_id", "started_at", "my_civ", "opponent", "opponent_civ", "result", "map", "leaderboard", "duration_seconds");
        for (GameView game : page.games()) {
            var me = game.players().stream().filter(p -> profileId == p.profileId()).findFirst().orElse(null);
            var opp = game.players().stream().filter(p -> profileId != p.profileId()).findFirst().orElse(null);
            appendRow(sb,
                    String.valueOf(game.gameId()),
                    game.startedAt() != null ? game.startedAt().toString() : "",
                    me != null ? nullToEmpty(me.civilization()) : "",
                    opp != null ? nullToEmpty(opp.playerName()) : "",
                    opp != null ? nullToEmpty(opp.civilization()) : "",
                    me != null ? nullToEmpty(me.result()) : "",
                    nullToEmpty(game.mapName()),
                    nullToEmpty(game.leaderboardCode()),
                    game.durationSeconds() != null ? String.valueOf(game.durationSeconds()) : ""
            );
        }
        return sb.toString();
    }

    private static void appendRow(StringBuilder sb, String... values) {
        for (int i = 0; i < values.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(escape(values[i]));
        }
        sb.append('\n');
    }

    private static String escape(String value) {
        if (value == null) {
            return "";
        }
        if (value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    private static String formatPercent(double rate) {
        return String.format(Locale.ROOT, "%.4f", rate);
    }

    private static String formatDouble(double value) {
        return String.format(Locale.ROOT, "%.2f", value);
    }

    private static String nullToEmpty(String value) {
        return value != null ? value : "";
    }
}
