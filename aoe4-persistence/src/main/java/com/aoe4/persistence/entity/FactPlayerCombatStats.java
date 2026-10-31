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
@Table(name = "fact_player_combat_stats")
@IdClass(FactPlayerCombatStats.CombatId.class)
public class FactPlayerCombatStats {

    @Id
    @Column(name = "game_id")
    private Long gameId;

    @Id
    @Column(name = "profile_id")
    private Long profileId;

    @Column(name = "buildings_lost")
    private Integer buildingsLost;

    @Column(name = "units_lost")
    private Integer unitsLost;

    @Column(name = "unit_kills")
    private Integer unitKills;

    @Column(name = "squad_kills")
    private Integer squadKills;

    @Column(name = "enemy_deaths")
    private Integer enemyDeaths;

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

    public Integer getBuildingsLost() {
        return buildingsLost;
    }

    public void setBuildingsLost(Integer buildingsLost) {
        this.buildingsLost = buildingsLost;
    }

    public Integer getUnitsLost() {
        return unitsLost;
    }

    public void setUnitsLost(Integer unitsLost) {
        this.unitsLost = unitsLost;
    }

    public Integer getUnitKills() {
        return unitKills;
    }

    public void setUnitKills(Integer unitKills) {
        this.unitKills = unitKills;
    }

    public Integer getSquadKills() {
        return squadKills;
    }

    public void setSquadKills(Integer squadKills) {
        this.squadKills = squadKills;
    }

    public Integer getEnemyDeaths() {
        return enemyDeaths;
    }

    public void setEnemyDeaths(Integer enemyDeaths) {
        this.enemyDeaths = enemyDeaths;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public static class CombatId implements Serializable {
        private Long gameId;
        private Long profileId;

        public CombatId() {
        }

        public CombatId(Long gameId, Long profileId) {
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
            CombatId combatId = (CombatId) o;
            return Objects.equals(gameId, combatId.gameId) && Objects.equals(profileId, combatId.profileId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(gameId, profileId);
        }
    }
}
