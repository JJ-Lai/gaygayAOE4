package com.aoe4.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "fact_game_player_resource")
public class FactGamePlayerResource {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "game_id")
    private Long gameId;

    @Column(name = "profile_id")
    private Long profileId;

    @Column(name = "resource_code")
    private String resourceCode;

    @Column(name = "second_mark")
    private Integer secondMark;

    @Column(name = "series_index")
    private Integer seriesIndex;

    @Column(name = "minute_index")
    private Integer minuteIndex;

    @Column(name = "accumulated_value")
    private Integer accumulatedValue;

    @Column(name = "per_minute_value")
    private Integer perMinuteValue;

    @Column(name = "created_at")
    private Instant createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getGameId() {
        return gameId;
    }

    public void setGameId(Long gameId) {
        this.gameId = gameId;
    }

    public Long getProfileId() {
        return profileId;
    }

    public void setProfileId(Long profileId) {
        this.profileId = profileId;
    }

    public String getResourceCode() {
        return resourceCode;
    }

    public void setResourceCode(String resourceCode) {
        this.resourceCode = resourceCode;
    }

    public Integer getSecondMark() {
        return secondMark;
    }

    public void setSecondMark(Integer secondMark) {
        this.secondMark = secondMark;
    }

    public Integer getSeriesIndex() {
        return seriesIndex;
    }

    public void setSeriesIndex(Integer seriesIndex) {
        this.seriesIndex = seriesIndex;
    }

    public Integer getMinuteIndex() {
        return minuteIndex;
    }

    public void setMinuteIndex(Integer minuteIndex) {
        this.minuteIndex = minuteIndex;
    }

    public Integer getAccumulatedValue() {
        return accumulatedValue;
    }

    public void setAccumulatedValue(Integer accumulatedValue) {
        this.accumulatedValue = accumulatedValue;
    }

    public Integer getPerMinuteValue() {
        return perMinuteValue;
    }

    public void setPerMinuteValue(Integer perMinuteValue) {
        this.perMinuteValue = perMinuteValue;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
