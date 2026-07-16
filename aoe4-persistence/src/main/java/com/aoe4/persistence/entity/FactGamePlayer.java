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
@Table(name = "fact_game_player")
@IdClass(FactGamePlayer.GamePlayerId.class)
public class FactGamePlayer {

    @Id
    @Column(name = "game_id")
    private Long gameId;

    @Id
    @Column(name = "profile_id")
    private Long profileId;

    @Column(name = "civ_code")
    private String civCode;

    @Column(name = "team_index")
    private Integer teamIndex;

    private String result;
    private Integer rating;

    @Column(name = "rating_diff")
    private Integer ratingDiff;

    private Integer mmr;

    @Column(name = "mmr_diff")
    private Integer mmrDiff;

    private Boolean won;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

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

    public String getCivCode() {
        return civCode;
    }

    public void setCivCode(String civCode) {
        this.civCode = civCode;
    }

    public Integer getTeamIndex() {
        return teamIndex;
    }

    public void setTeamIndex(Integer teamIndex) {
        this.teamIndex = teamIndex;
    }

    public String getResult() {
        return result;
    }

    public void setResult(String result) {
        this.result = result;
    }

    public Integer getRating() {
        return rating;
    }

    public void setRating(Integer rating) {
        this.rating = rating;
    }

    public Integer getRatingDiff() {
        return ratingDiff;
    }

    public void setRatingDiff(Integer ratingDiff) {
        this.ratingDiff = ratingDiff;
    }

    public Integer getMmr() {
        return mmr;
    }

    public void setMmr(Integer mmr) {
        this.mmr = mmr;
    }

    public Integer getMmrDiff() {
        return mmrDiff;
    }

    public void setMmrDiff(Integer mmrDiff) {
        this.mmrDiff = mmrDiff;
    }

    public Boolean getWon() {
        return won;
    }

    public void setWon(Boolean won) {
        this.won = won;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public static class GamePlayerId implements Serializable {
        private Long gameId;
        private Long profileId;

        public GamePlayerId() {
        }

        public GamePlayerId(Long gameId, Long profileId) {
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
            GamePlayerId that = (GamePlayerId) o;
            return Objects.equals(gameId, that.gameId) && Objects.equals(profileId, that.profileId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(gameId, profileId);
        }
    }
}
