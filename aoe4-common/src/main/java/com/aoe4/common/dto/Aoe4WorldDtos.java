package com.aoe4.common.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class Aoe4WorldDtos {

    private Aoe4WorldDtos() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PlayerApiResponse(
            String name,
            @JsonProperty("profile_id") Long profileId,
            @JsonProperty("steam_id") String steamId,
            String country,
            Map<String, Object> modes
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GamesListApiResponse(
            @JsonProperty("total_count") Integer totalCount,
            Integer page,
            @JsonProperty("per_page") Integer perPage,
            Integer count,
            List<GameApiResponse> games
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GameApiResponse(
            @JsonProperty("game_id") Long gameId,
            @JsonProperty("started_at") Instant startedAt,
            @JsonProperty("updated_at") Instant updatedAt,
            Integer duration,
            String map,
            String kind,
            String leaderboard,
            Integer season,
            String server,
            Integer patch,
            @JsonProperty("ongoing") Boolean ongoing,
            List<List<TeamSlotApiResponse>> teams
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TeamSlotApiResponse(
            GamePlayerApiResponse player
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GamePlayerApiResponse(
            @JsonProperty("profile_id") Long profileId,
            String name,
            String country,
            String result,
            String civilization,
            Integer rating,
            @JsonProperty("rating_diff") Integer ratingDiff,
            Integer mmr,
            @JsonProperty("mmr_diff") Integer mmrDiff
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PlayerSearchApiResponse(
            @JsonProperty("total_count") Integer totalCount,
            List<PlayerSearchHitApiResponse> players
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PlayerSearchHitApiResponse(
            String name,
            @JsonProperty("profile_id") Long profileId,
            String country
    ) {
    }
}
