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
@Table(name = "agg_matchup_matrix")
public class AggMatchupMatrix {

    @EmbeddedId
    private Id id;

    @Column(name = "games")
    private long games;

    @Column(name = "wins")
    private long wins;

    @Column(name = "losses")
    private long losses;

    @Column(name = "military_diff_sum")
    private Double militaryDiffSum;

    @Column(name = "refreshed_at")
    private Instant refreshedAt;

    public Id getId() {
        return id;
    }

    public void setId(Id id) {
        this.id = id;
    }

    public long getGames() {
        return games;
    }

    public void setGames(long games) {
        this.games = games;
    }

    public long getWins() {
        return wins;
    }

    public void setWins(long wins) {
        this.wins = wins;
    }

    public long getLosses() {
        return losses;
    }

    public void setLosses(long losses) {
        this.losses = losses;
    }

    public Double getMilitaryDiffSum() {
        return militaryDiffSum;
    }

    public void setMilitaryDiffSum(Double militaryDiffSum) {
        this.militaryDiffSum = militaryDiffSum;
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

        @Column(name = "player_civ")
        private String playerCiv;

        @Column(name = "opponent_civ")
        private String opponentCiv;

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

        public String getPlayerCiv() {
            return playerCiv;
        }

        public void setPlayerCiv(String playerCiv) {
            this.playerCiv = playerCiv;
        }

        public String getOpponentCiv() {
            return opponentCiv;
        }

        public void setOpponentCiv(String opponentCiv) {
            this.opponentCiv = opponentCiv;
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
            return Objects.equals(profileId, id.profileId)
                    && Objects.equals(leaderboardCode, id.leaderboardCode)
                    && Objects.equals(playerCiv, id.playerCiv)
                    && Objects.equals(opponentCiv, id.opponentCiv);
        }

        @Override
        public int hashCode() {
            return Objects.hash(profileId, leaderboardCode, playerCiv, opponentCiv);
        }
    }
}
