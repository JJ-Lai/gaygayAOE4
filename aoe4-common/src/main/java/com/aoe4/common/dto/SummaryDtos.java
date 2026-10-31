package com.aoe4.common.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

public final class SummaryDtos {

    private SummaryDtos() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GameSummaryApiResponse(
            Long gameId,
            Integer summaryVersion,
            List<SummaryPlayer> players
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SummaryPlayer(
            Long profileId,
            String name,
            String civilization,
            String result,
            SummaryScores scores,
            SummaryResources resources,
            List<BuildOrderItem> buildOrder,
            @JsonProperty("_stats") SummaryPlayerStats stats
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SummaryPlayerStats(
            @JsonProperty("blost") Integer buildingsLost,
            @JsonProperty("sqlost") Integer unitsLost,
            @JsonProperty("ekills") Integer unitKills,
            @JsonProperty("sqkill") Integer squadKills,
            @JsonProperty("edeaths") Integer enemyDeaths
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SummaryScores(
            Integer total,
            Integer military,
            Integer economy,
            Integer technology,
            Integer society
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SummaryResources(
            List<Integer> timestamps,
            List<Integer> food,
            List<Integer> wood,
            List<Integer> gold,
            List<Integer> stone,
            List<Integer> oliveoil,
            List<Integer> total,
            @JsonProperty("foodPerMin") List<Integer> foodPerMin,
            @JsonProperty("woodPerMin") List<Integer> woodPerMin,
            @JsonProperty("goldPerMin") List<Integer> goldPerMin,
            @JsonProperty("stonePerMin") List<Integer> stonePerMin,
            @JsonProperty("oliveoilPerMin") List<Integer> oliveoilPerMin,
            List<Integer> military
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record BuildOrderItem(
            String id,
            String icon,
            Long pbgid,
            String type,
            List<Integer> finished,
            List<Integer> constructed,
            List<Integer> destroyed
    ) {
    }
}
