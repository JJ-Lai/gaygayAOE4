package com.aoe4.common.dto;

import java.time.Instant;
import java.util.List;

public final class AnalyticsViews {

    private AnalyticsViews() {
    }

    public record PlayerOverviewView(
            Long profileId,
            long totalGames,
            long wins,
            long losses,
            double winRate,
            String mostPlayedCiv,
            long gamesWithSummary,
            List<RecentTrendPoint> recentTrend
    ) {
    }

    public record RecentTrendPoint(
            Instant startedAt,
            String result,
            String civilization,
            Long gameId
    ) {
    }

    public record CivStatsView(
            Long profileId,
            List<CivStatRow> civilizations
    ) {
    }

    public record MapStatsView(
            Long profileId,
            List<MapStatRow> maps
    ) {
    }

    public record MapStatRow(
            String mapCode,
            String mapName,
            long games,
            long wins,
            long losses,
            double winRate
    ) {
    }

    public record PatchStatsView(
            Long profileId,
            List<PatchStatRow> patches
    ) {
    }

    public record PatchStatRow(
            String patchCode,
            String patchLabel,
            long games,
            long wins,
            long losses,
            double winRate
    ) {
    }

    public record ModeStatsView(
            Long profileId,
            List<ModeStatRow> modes
    ) {
    }

    public record ModeStatRow(
            String modeCode,
            String modeName,
            long games,
            long wins,
            long losses,
            double winRate
    ) {
    }

    public record CombatStatsView(
            Long profileId,
            List<CombatStatRow> civilizations
    ) {
    }

    public record CombatStatRow(
            String civCode,
            String civName,
            long games,
            double avgBuildingsLost,
            double avgUnitsLost,
            double avgUnitKills,
            double avgSquadKills,
            double avgEnemyDeaths
    ) {
    }

    public record UnitLossStatsView(
            Long profileId,
            List<UnitLossRow> units
    ) {
    }

    public record UnitLossRow(
            String entityType,
            Long pbgid,
            String displayName,
            long lossCount,
            long gameCount
    ) {
    }

    public record CivStatRow(
            String civCode,
            String civName,
            long games,
            long wins,
            long losses,
            double winRate
    ) {
    }

    public record ResourceTimelineView(
            Long profileId,
            List<ResourceTimelinePoint> points
    ) {
    }

    public record ResourceTimelinePoint(
            int minute,
            String resource,
            double value,
            long gameCount
    ) {
    }

    public record MatchupMatrixView(
            Long profileId,
            List<MatchupRow> matchups
    ) {
    }

    public record MatchupRow(
            String playerCiv,
            String opponentCiv,
            long wins,
            long losses,
            double winRate,
            Double avgMilitaryDiff
    ) {
    }

    public record MilitaryLossRatioView(
            Long profileId,
            String playerCiv,
            List<MilitaryLossRow> byOpponentCiv
    ) {
    }

    public record MilitaryLossRow(
            String opponentCiv,
            long games,
            long wins,
            double winRate,
            Double avgMilitaryDiff
    ) {
    }

    public record BuildPreferencesView(
            Long profileId,
            int minuteFrom,
            int minuteTo,
            List<BuildPreferenceRow> items
    ) {
    }

    public record BuildPreferenceRow(
            String entityType,
            Long pbgid,
            String displayName,
            long count
    ) {
    }

    public record GameTimelineView(
            Long gameId,
            Long profileId,
            List<TimelineResourceSeries> resources,
            List<TimelineArmyPoint> armyValues,
            List<TimelineBuildEvent> buildEvents,
            TimelineOpponentView opponent,
            List<TimelineOpponentOption> availableOpponents
    ) {
    }

    public record TimelineOpponentOption(
            Long profileId,
            String playerName,
            String civilization,
            boolean hasTimelineData,
            String relationship
    ) {
    }

    public record TimelineOpponentView(
            Long profileId,
            String playerName,
            String civilization,
            List<TimelineResourceSeries> resources,
            List<TimelineArmyPoint> armyValues,
            List<TimelineBuildEvent> buildEvents
    ) {
    }

    public record TimelineResourceSeries(
            String resource,
            List<TimelineMinuteValue> points
    ) {
    }

    public record TimelineMinuteValue(
            int minute,
            int secondMark,
            int accumulatedValue,
            Integer perMinuteValue
    ) {
    }

    public record TimelineArmyPoint(
            int minute,
            int secondMark,
            int armyValue
    ) {
    }

    public record TimelineBuildEvent(
            int eventSecond,
            int minute,
            String entityType,
            Long pbgid,
            String displayName,
            String eventKind
    ) {
    }

    public record MetaFiltersView(
            List<MetaOption> civilizations,
            List<MetaOption> maps,
            List<MetaOption> leaderboards,
            List<MetaOption> patches,
            List<MetaOption> resourceTypes
    ) {
    }

    public record MetaOption(
            String code,
            String displayName
    ) {
    }
}
