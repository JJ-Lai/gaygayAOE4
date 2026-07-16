package com.aoe4.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

@Entity
@Table(name = "agg_resource_timeline")
public class AggResourceTimeline {

    @EmbeddedId
    private Id id;

    @Column(name = "avg_value")
    private double avgValue;

    @Column(name = "game_count")
    private long gameCount;

    @Column(name = "refreshed_at")
    private Instant refreshedAt;

    public Id getId() {
        return id;
    }

    public void setId(Id id) {
        this.id = id;
    }

    public double getAvgValue() {
        return avgValue;
    }

    public void setAvgValue(double avgValue) {
        this.avgValue = avgValue;
    }

    public long getGameCount() {
        return gameCount;
    }

    public void setGameCount(long gameCount) {
        this.gameCount = gameCount;
    }

    public Instant getRefreshedAt() {
        return refreshedAt;
    }

    public void setRefreshedAt(Instant refreshedAt) {
        this.refreshedAt = refreshedAt;
    }

    @Embeddable
    public static class Id implements Serializable {
        @Column(name = "profile_id")
        private Long profileId;

        @Column(name = "leaderboard_code")
        private String leaderboardCode;

        @Column(name = "civ_code")
        private String civCode;

        @Column(name = "minute_index")
        private int minuteIndex;

        @Column(name = "resource_code")
        private String resourceCode;

        public Long getProfileId() {
            return profileId;
        }

        public void setProfileId(Long profileId) {
            this.profileId = profileId;
        }

        public String getLeaderboardCode() {
            return leaderboardCode;
        }

        public void setLeaderboardCode(String leaderboardCode) {
            this.leaderboardCode = leaderboardCode;
        }

        public String getCivCode() {
            return civCode;
        }

        public void setCivCode(String civCode) {
            this.civCode = civCode;
        }

        public int getMinuteIndex() {
            return minuteIndex;
        }

        public void setMinuteIndex(int minuteIndex) {
            this.minuteIndex = minuteIndex;
        }

        public String getResourceCode() {
            return resourceCode;
        }

        public void setResourceCode(String resourceCode) {
            this.resourceCode = resourceCode;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) {
                return true;
            }
            if (o == null || getClass() != o.getClass()) {
                return false;
            }
            Id id = (Id) o;
            return minuteIndex == id.minuteIndex
                    && Objects.equals(profileId, id.profileId)
                    && Objects.equals(leaderboardCode, id.leaderboardCode)
                    && Objects.equals(civCode, id.civCode)
                    && Objects.equals(resourceCode, id.resourceCode);
        }

        @Override
        public int hashCode() {
            return Objects.hash(profileId, leaderboardCode, civCode, minuteIndex, resourceCode);
        }
    }
}
