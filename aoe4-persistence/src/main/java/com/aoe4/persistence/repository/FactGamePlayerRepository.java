package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.FactGamePlayer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface FactGamePlayerRepository extends JpaRepository<FactGamePlayer, FactGamePlayer.GamePlayerId> {
    List<FactGamePlayer> findByGameId(Long gameId);
    List<FactGamePlayer> findByProfileId(Long profileId);

    @Query("SELECT DISTINCT gp.profileId FROM FactGamePlayer gp")
    List<Long> findDistinctProfileIds();
}
