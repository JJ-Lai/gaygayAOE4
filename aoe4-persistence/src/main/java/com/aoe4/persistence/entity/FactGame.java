package com.aoe4.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "fact_game")
public class FactGame {

    @Id
    @Column(name = "game_id")
    private Long gameId;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    @Column(name = "map_id")
    private Long mapId;

    @Column(name = "leaderboard_code")
    private String leaderboardCode;

    private String kind;

    @Column(name = "patch_number")
    private Integer patchNumber;

    private String server;
    private Integer season;
    private Boolean ongoing;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at_row")
    private Instant updatedAtRow;

    public Long getGameId() {
        return gameId;
    }

    public void setGameId(Long gameId) {
        this.gameId = gameId;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant startedAt) {
        this.startedAt = startedAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Integer getDurationSeconds() {
        return durationSeconds;
    }

    public void setDurationSeconds(Integer durationSeconds) {
        this.durationSeconds = durationSeconds;
    }

    public Long getMapId() {
        return mapId;
    }

    public void setMapId(Long mapId) {
        this.mapId = mapId;
    }

    public String getLeaderboardCode() {
        return leaderboardCode;
    }

    public void setLeaderboardCode(String leaderboardCode) {
        this.leaderboardCode = leaderboardCode;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public Integer getPatchNumber() {
        return patchNumber;
    }

    public void setPatchNumber(Integer patchNumber) {
        this.patchNumber = patchNumber;
    }

    public String getServer() {
        return server;
    }

    public void setServer(String server) {
        this.server = server;
    }

    public Integer getSeason() {
        return season;
    }

    public void setSeason(Integer season) {
        this.season = season;
    }

    public Boolean getOngoing() {
        return ongoing;
    }

    public void setOngoing(Boolean ongoing) {
        this.ongoing = ongoing;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAtRow() {
        return updatedAtRow;
    }

    public void setUpdatedAtRow(Instant updatedAtRow) {
        this.updatedAtRow = updatedAtRow;
    }
}
