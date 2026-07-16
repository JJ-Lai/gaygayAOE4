package com.aoe4.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

@Entity
@Table(name = "fact_game_player_score")
@IdClass(FactGamePlayerScore.ScoreId.class)
public class FactGamePlayerScore {

    @Id
    @Column(name = "game_id")
    private Long gameId;

    @Id
    @Column(name = "profile_id")
    private Long profileId;

    @Column(name = "total_score")
    private Integer totalScore;

    @Column(name = "military_score")
    private Integer militaryScore;

    @Column(name = "economy_score")
    private Integer economyScore;

    @Column(name = "technology_score")
    private Integer technologyScore;

    @Column(name = "society_score")
    private Integer societyScore;

    @Column(name = "created_at")
    private Instant createdAt;

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

    public Integer getTotalScore() {
        return totalScore;
    }

    public void setTotalScore(Integer totalScore) {
        this.totalScore = totalScore;
    }

    public Integer getMilitaryScore() {
        return militaryScore;
    }

    public void setMilitaryScore(Integer militaryScore) {
        this.militaryScore = militaryScore;
    }

    public Integer getEconomyScore() {
        return economyScore;
    }

    public void setEconomyScore(Integer economyScore) {
        this.economyScore = economyScore;
    }

    public Integer getTechnologyScore() {
        return technologyScore;
    }

    public void setTechnologyScore(Integer technologyScore) {
        this.technologyScore = technologyScore;
    }

    public Integer getSocietyScore() {
        return societyScore;
    }

    public void setSocietyScore(Integer societyScore) {
        this.societyScore = societyScore;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public static class ScoreId implements Serializable {
        private Long gameId;
        private Long profileId;

        public ScoreId() {
        }

        public ScoreId(Long gameId, Long profileId) {
            this.gameId = gameId;
            this.profileId = profileId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) {
                return true;
            }
            if (o == null || getClass() != o.getClass()) {
                return false;
            }
            ScoreId scoreId = (ScoreId) o;
            return Objects.equals(gameId, scoreId.gameId) && Objects.equals(profileId, scoreId.profileId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(gameId, profileId);
        }
    }
}
