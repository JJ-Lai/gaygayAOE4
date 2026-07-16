package com.aoe4.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "dim_leaderboard")
public class DimLeaderboard {

    @Id
    @Column(name = "leaderboard_code")
    private String leaderboardCode;

    @Column(name = "display_name")
    private String displayName;

    @Column(name = "created_at")
    private Instant createdAt;

    public String getLeaderboardCode() {
        return leaderboardCode;
    }

    public void setLeaderboardCode(String leaderboardCode) {
        this.leaderboardCode = leaderboardCode;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
