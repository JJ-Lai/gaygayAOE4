package com.aoe4.persistence.repository;

import com.aoe4.persistence.entity.FactPlayerCombatStats;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FactPlayerCombatStatsRepository extends JpaRepository<FactPlayerCombatStats, FactPlayerCombatStats.CombatId> {

    void deleteByGameIdAndProfileId(Long gameId, Long profileId);
}
